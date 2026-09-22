import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, aiSessions, aiMessages, aiSources } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { answerFromTextbook } from '@/lib/rag/answer';
import { TUTOR_MODES } from '@/lib/tutor/modes';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';
import { timed } from '@/lib/log';

const Body = z.object({
  query: z.string().min(1).max(2000),
  scope: z.enum(['page', 'chapter', 'textbook', 'library']),
  textbookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  pageNumber: z.number().int().positive().optional(),
  mode: z.enum(TUTOR_MODES).default('normal'),
  sessionId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`ask:${user.id}`, LIMITS.ask.limit, LIMITS.ask.window);
    const body = Body.parse(await req.json());

    // Ownership is verified here, before retrieval, not inferred from the query.
    if (body.textbookId) {
      const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, body.textbookId) });
      assertOwnership(user, book);
      if (book!.status !== 'ready') {
        return NextResponse.json(
          { error: 'This textbook is still processing. Ask again once it is ready.' },
          { status: 409 },
        );
      }
    }

    const result = await timed('rag.answer', () => answerFromTextbook({
      ownerId: user.id,
      query: body.query,
      scope: body.scope,
      textbookId: body.textbookId,
      chapterId: body.chapterId,
      pageNumber: body.pageNumber,
      mode: body.mode,
    }), { scope: body.scope, mode: body.mode });

    // Persist the conversation, owned by and visible only to this student.
    let sessionId = body.sessionId;
    if (sessionId) {
      const existing = await db.query.aiSessions.findFirst({
        where: and(eq(aiSessions.id, sessionId), eq(aiSessions.ownerId, user.id)),
      });
      assertOwnership(user, existing);
    } else {
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
    const [assistantMsg] = await db.insert(aiMessages).values({
      sessionId, ownerId: user.id, role: 'assistant',
      content: result.answer,
      insufficientEvidence: result.insufficientEvidence,
    }).returning({ id: aiMessages.id });

    if (result.sources.length > 0) {
      await db.insert(aiSources).values(
        result.sources.map((s) => ({
          messageId: assistantMsg!.id,
          chunkId: s.chunkId,
          pageNumber: s.pageNumber,
          chapterTitle: s.chapterTitle,
        })),
      );
    }

    return NextResponse.json({ ...result, sessionId });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return handleError(err, 'api.ask.failed');
  }
}
