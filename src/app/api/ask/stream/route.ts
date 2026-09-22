import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, aiSessions, aiMessages, aiSources } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { retrieve } from '@/lib/rag/retrieve';
import { INSUFFICIENT_EVIDENCE } from '@/lib/rag/answer';
import { sanitiseTextbookText } from '@/lib/rag/sanitise';
import { systemPromptFor, TUTOR_MODES } from '@/lib/tutor/modes';
import { ai } from '@/lib/ai';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const Body = z.object({
  query: z.string().min(1).max(2000),
  scope: z.enum(['page', 'chapter', 'textbook', 'library']),
  textbookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  pageNumber: z.number().int().positive().optional(),
  mode: z.enum(TUTOR_MODES).default('normal'),
  sessionId: z.string().uuid().optional(),
});

const MIN_EVIDENCE_SCORE = 0.012;
const MIN_EVIDENCE_CHARS = 200;

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Server-sent stream. Evidence sufficiency is decided before the model is called,
 * so an under-evidenced question emits the refusal immediately rather than
 * streaming a plausible-sounding fabrication and retracting it at the end.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`ask:${user.id}`, LIMITS.ask.limit, LIMITS.ask.window);
    const body = Body.parse(await req.json());

    if (body.textbookId) {
      const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, body.textbookId) });
      assertOwnership(user, book);
      if (book!.status !== 'ready') {
        return NextResponse.json({ error: 'This textbook is still processing.' }, { status: 409 });
      }
    }

    const chunks = await retrieve({
      ownerId: user.id,
      query: body.query,
      scope: body.scope,
      textbookId: body.textbookId,
      chapterId: body.chapterId,
      pageNumber: body.pageNumber,
    });

    const usable = chunks.filter((c) => c.score >= MIN_EVIDENCE_SCORE);
    const totalChars = usable.reduce((n, c) => n + c.text.length, 0);

    let sessionId = body.sessionId;
    if (!sessionId) {
      const [created] = await db.insert(aiSessions).values({
        ownerId: user.id,
        textbookId: body.textbookId ?? null,
        mode: body.mode,
        title: body.query.slice(0, 80),
      }).returning({ id: aiSessions.id });
      sessionId = created!.id;
    }
    await db.insert(aiMessages).values({
      sessionId, ownerId: user.id, role: 'user', content: body.query,
    });

    const encoder = new TextEncoder();

    if (usable.length === 0 || totalChars < MIN_EVIDENCE_CHARS) {
      await db.insert(aiMessages).values({
        sessionId, ownerId: user.id, role: 'assistant',
        content: INSUFFICIENT_EVIDENCE, insufficientEvidence: true,
      });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sse({ delta: INSUFFICIENT_EVIDENCE })));
          controller.enqueue(encoder.encode(sse({
            done: { answer: INSUFFICIENT_EVIDENCE, sources: [], insufficientEvidence: true, sessionId },
          })));
          controller.close();
        },
      });
      return new Response(stream, { headers: SSE_HEADERS });
    }

    const evidence = usable
      .map((c, i) =>
        `<evidence id="${i + 1}" source="${c.textbookTitle} — ${c.chapterTitle ?? 'unstructured'} — page ${c.pageNumber}">\n` +
        `${sanitiseTextbookText(c.text)}\n</evidence>`)
      .join('\n\n');

    const sources = usable.map((c) => ({
      chunkId: c.chunkId,
      pageNumber: c.pageNumber,
      chapterTitle: c.chapterTitle,
      textbookTitle: c.textbookTitle,
    }));

    const stream = new ReadableStream({
      async start(controller) {
        let full = '';
        try {
          for await (const delta of ai().stream({
            system: systemPromptFor(body.mode),
            messages: [{ role: 'user', content: `${evidence}\n\nStudent question: ${body.query}` }],
            maxTokens: 1200,
          })) {
            full += delta;
            controller.enqueue(encoder.encode(sse({ delta })));
          }

          const declined = full.includes(INSUFFICIENT_EVIDENCE);
          const [msg] = await db.insert(aiMessages).values({
            sessionId: sessionId!, ownerId: user.id, role: 'assistant',
            content: full, insufficientEvidence: declined,
          }).returning({ id: aiMessages.id });

          if (!declined && sources.length > 0) {
            await db.insert(aiSources).values(sources.map((s) => ({
              messageId: msg!.id,
              chunkId: s.chunkId,
              pageNumber: s.pageNumber,
              chapterTitle: s.chapterTitle,
            })));
          }

          controller.enqueue(encoder.encode(sse({
            done: {
              answer: full,
              sources: declined ? [] : sources,
              insufficientEvidence: declined,
              sessionId,
            },
          })));
        } catch {
          controller.enqueue(encoder.encode(sse({
            error: 'The AI stream was interrupted. Please try again.',
          })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.ask_stream.failed');
  }
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;
