import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and, lte } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChapters, textbookChunks, flashcards, revisionItems } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { ai } from '@/lib/ai';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';
import { bucketFor } from '@/lib/learning/revision';

/** GET: due/all flashcards for a chapter, bucketed by the real SM-2 state. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const chapterId = req.nextUrl.searchParams.get('chapterId');
    if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });

    const chapter = await db.query.textbookChapters.findFirst({ where: eq(textbookChapters.id, chapterId) });
    assertOwnership(user, chapter);

    const cards = await db.query.flashcards.findMany({
      where: and(eq(flashcards.ownerId, user.id), eq(flashcards.chapterId, chapterId)),
    });

    const withState = await Promise.all(cards.map(async (c) => {
      const rev = await db.query.revisionItems.findFirst({
        where: and(eq(revisionItems.ownerId, user.id), eq(revisionItems.flashcardId, c.id)),
      });
      const state = rev
        ? { easeFactor: rev.easeFactor, intervalDays: rev.intervalDays, repetitions: rev.repetitions, lastReviewedAt: rev.lastReviewedAt, nextReviewAt: rev.nextReviewAt }
        : { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lastReviewedAt: null, nextReviewAt: new Date() };
      return {
        id: c.id, front: c.front, back: c.back, kind: c.kind,
        bucket: bucketFor(state), nextReviewAt: state.nextReviewAt.toISOString(),
      };
    }));

    return NextResponse.json(withState);
  } catch (err) {
    return handleError(err, 'api.flashcards_list.failed');
  }
}

const GenerateBody = z.object({ chapterId: z.string().uuid(), count: z.number().int().min(1).max(30).default(15) });

/** POST: generate flashcards from real chapter chunks. Never invents cards without evidence. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`flashcards:${user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
    const body = GenerateBody.parse(await req.json());

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
    const raw = await ai().generate({
      system: `Generate exactly ${body.count} flashcards strictly from the given textbook text. Return ONLY a JSON array, no prose, no markdown fences. Each item: {"front": "...", "back": "...", "kind": "definition|formula|concept|qa"}.`,
      messages: [{ role: 'user', content: evidence }],
      maxTokens: 1800,
    });

    const parsed = extractJsonArray(raw);
    if (!parsed) return NextResponse.json({ error: 'Flashcard generation failed. Try again.' }, { status: 502 });

    const rows = await db.insert(flashcards).values(
      parsed.map((c: any) => ({
        ownerId: user.id, textbookId: chapter!.textbookId, chapterId: chapter!.id,
        front: String(c.front ?? ''), back: String(c.back ?? ''), kind: String(c.kind ?? 'concept'),
        sourceChunkIds: chunks.map((ch) => ch.id),
      })),
    ).returning({ id: flashcards.id, front: flashcards.front, back: flashcards.back, kind: flashcards.kind });

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.flashcards_generate.failed');
  }
}

function extractJsonArray(text: string): unknown[] | null {
  let t = text.replace(/```json/gi, '```').trim();
  const m = t.match(/```([\s\S]*?)```/);
  if (m) t = m[1]!.trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
