import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { flashcards, revisionItems, flashcardReviews, examDates } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { scheduleReview, bucketFor, type ReviewGrade } from '@/lib/learning/revision';
import { handleError } from '@/lib/http';

const Body = z.object({ grade: z.union([z.literal(0), z.literal(3), z.literal(5)]) });

/** The only place SM-2 runs. The frontend never computes an interval itself. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());

    const card = await db.query.flashcards.findFirst({ where: eq(flashcards.id, id) });
    assertOwnership(user, card);

    const existing = await db.query.revisionItems.findFirst({
      where: and(eq(revisionItems.ownerId, user.id), eq(revisionItems.flashcardId, id)),
    });
    const prev = existing
      ? { easeFactor: existing.easeFactor, intervalDays: existing.intervalDays, repetitions: existing.repetitions, lastReviewedAt: existing.lastReviewedAt, nextReviewAt: existing.nextReviewAt }
      : { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lastReviewedAt: null, nextReviewAt: new Date() };

    const nearestExam = await db.query.examDates.findFirst({ where: eq(examDates.ownerId, user.id) });
    const next = scheduleReview(prev, body.grade as ReviewGrade, { examOn: nearestExam?.examOn ?? null });

    if (existing) {
      await db.update(revisionItems).set({
        easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions,
        lastReviewedAt: next.lastReviewedAt, nextReviewAt: next.nextReviewAt, bucket: bucketFor(next),
      }).where(eq(revisionItems.id, existing.id));
    } else {
      await db.insert(revisionItems).values({
        ownerId: user.id, flashcardId: id, chapterId: card!.chapterId,
        easeFactor: next.easeFactor, intervalDays: next.intervalDays, repetitions: next.repetitions,
        lastReviewedAt: next.lastReviewedAt, nextReviewAt: next.nextReviewAt, bucket: bucketFor(next),
      });
    }

    await db.insert(flashcardReviews).values({ ownerId: user.id, flashcardId: id, grade: body.grade });

    return NextResponse.json({ nextReviewAt: next.nextReviewAt.toISOString(), bucket: bucketFor(next) });
  } catch (err) {
    return handleError(err, 'api.flashcard_review.failed');
  }
}
