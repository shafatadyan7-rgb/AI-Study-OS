import { NextResponse } from 'next/server';
import { eq, and, gte } from 'drizzle-orm';
import { db } from '@/db';
import {
  achievementUnlocks, textbooks, quizAttempts, quizAnswers,
  flashcardReviews, mistakes, masteryRecords, studySessions,
} from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { evaluateAchievements, ACHIEVEMENTS, type AchievementKey } from '@/lib/learning/achievements';
import { currentStreak } from '@/lib/analytics/aggregate';
import { handleError } from '@/lib/http';

/**
 * Computes which achievements the student's real data qualifies for, unlocks
 * any newly-earned ones (idempotent — the unique index on (owner, key)
 * prevents duplicates even under a race), and returns the full list with
 * unlock state. Nothing here is ever unlocked just because the page renders.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const [textbookCount] = await db.select({ n: textbooks.id }).from(textbooks).where(eq(textbooks.ownerId, user.id));
    const finishedAttempts = await db.query.quizAttempts.findMany({
      where: and(eq(quizAttempts.ownerId, user.id)),
    });
    const finished = finishedAttempts.filter((a) => a.finishedAt !== null);
    const perfectAttempt = finished.find((a) => a.total >= 5 && a.score === a.total);

    const answerCount = await db.select({ n: quizAnswers.id }).from(quizAnswers).where(eq(quizAnswers.ownerId, user.id));
    const reviewCount = await db.select({ n: flashcardReviews.id }).from(flashcardReviews).where(eq(flashcardReviews.ownerId, user.id));
    const resolvedMistake = await db.query.mistakes.findFirst({
      where: and(eq(mistakes.ownerId, user.id), eq(mistakes.resolved, true)),
    });
    const masteredChapter = await db.query.masteryRecords.findFirst({
      where: and(eq(masteryRecords.ownerId, user.id), eq(masteryRecords.state, 'mastered')),
    });
    const sessions = await db.select({ startedAt: studySessions.startedAt }).from(studySessions).where(eq(studySessions.ownerId, user.id));

    const earned = evaluateAchievements({
      textbookCount: textbookCount ? 1 : 0,
      finishedQuizCount: finished.length,
      hadAPerfectQuizOf5Plus: !!perfectAttempt,
      flashcardReviewCount: reviewCount.length,
      totalQuestionsAnswered: answerCount.length,
      hasResolvedMistake: !!resolvedMistake,
      currentStreak: currentStreak(sessions.map((s) => ({ startedAt: s.startedAt, durationSeconds: null }))),
      hasMasteredChapter: !!masteredChapter,
    });

    const existing = await db.query.achievementUnlocks.findMany({ where: eq(achievementUnlocks.ownerId, user.id) });
    const existingKeys = new Set(existing.map((e) => e.key));
    const newlyEarned = earned.filter((k) => !existingKeys.has(k));

    if (newlyEarned.length > 0) {
      await db.insert(achievementUnlocks).values(
        newlyEarned.map((key: AchievementKey) => ({ ownerId: user.id, key })),
      ).onConflictDoNothing();
    }

    const unlockedKeys = new Set([...existingKeys, ...newlyEarned]);
    return NextResponse.json({
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlockedKeys.has(a.key) })),
      newlyUnlocked: newlyEarned,
    });
  } catch (err) {
    return handleError(err, 'api.achievements.failed');
  }
}
