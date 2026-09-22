import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbookChapters, textbookChunks, notes } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { ai } from '@/lib/ai';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const MODES = ['quick', 'chapter', 'concept', 'exam', 'revision', 'one_page'] as const;
const MODE_INSTRUCTION: Record<(typeof MODES)[number], string> = {
  quick: 'Produce a short quick-reference note: a handful of bullet points only.',
  chapter: 'Produce a full chapter note with headings, key points, definitions and formulas.',
  concept: 'Produce a focused note on the single most central concept in this material.',
  exam: 'Produce exam-focused notes: definitions, formulas and likely question patterns, terse.',
  revision: 'Produce a rapid revision recap: bullets only, no prose paragraphs.',
  one_page: 'Produce a one-page summary that could be read in under two minutes.',
};

const Body = z.object({ chapterId: z.string().uuid(), mode: z.enum(MODES).default('chapter') });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`notes:${user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
    const body = Body.parse(await req.json());

    const chapter = await db.query.textbookChapters.findFirst({ where: eq(textbookChapters.id, body.chapterId) });
    assertOwnership(user, chapter);

    const chunks = await db.query.textbookChunks.findMany({
      where: and(eq(textbookChunks.ownerId, user.id), eq(textbookChunks.chapterId, body.chapterId)),
      limit: 40,
    });
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'This chapter has no indexed content yet.' }, { status: 409 });
    }

    const evidence = chunks.map((c) => `[p.${c.pageNumber}] ${c.text}`).join('\n').slice(0, 9000);
    const generated = await ai().generate({
      system: `${MODE_INSTRUCTION[body.mode]} Use only the given textbook text. Cite page numbers in parentheses after key facts. Use markdown.`,
      messages: [{ role: 'user', content: evidence }],
      maxTokens: 1500,
    });

    const [row] = await db.insert(notes).values({
      ownerId: user.id, textbookId: chapter!.textbookId, chapterId: chapter!.id,
      mode: body.mode, title: `${chapter!.title} — ${body.mode.replace('_', ' ')} notes`,
      body: generated, sourceChunkIds: chunks.map((c) => c.id), aiGenerated: true,
    }).returning({ id: notes.id });

    return NextResponse.json({ id: row!.id, body: generated });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.notes_generate.failed');
  }
}
