import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChapters, quizAttempts, quizAnswers, mistakes, revisionItems, examDates } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { computeMastery, type AttemptSignal } from '@/lib/learning/mastery';
import { dailyRecommendation } from '@/lib/learning/coach';
import { handleError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();

    const books = await db.query.textbooks.findMany({
      where: and(eq(textbooks.ownerId, user.id), eq(textbooks.status, 'ready')),
    });

    const chapters = (await Promise.all(
      books.map((b) => db.query.textbookChapters.findMany({ where: eq(textbookChapters.textbookId, b.id) })),
    )).flat();

    const plannerChapters = await Promise.all(chapters.map(async (chapter) => {
      const answers = await db
        .select({ isCorrect: quizAnswers.isCorrect, answeredAt: quizAnswers.answeredAt })
        .from(quizAnswers)
        .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
        .where(and(eq(quizAnswers.ownerId, user.id), eq(quizAttempts.chapterId, chapter.id)));

      const attempts: AttemptSignal[] = answers.map((a) => ({
        correct: a.isCorrect, answeredAt: a.answeredAt, difficulty: 'medium', questionType: 'mcq',
      }));

      const unresolved = await db.query.mistakes.findMany({
        where: and(eq(mistakes.ownerId, user.id), eq(mistakes.chapterId, chapter.id), eq(mistakes.resolved, false)),
      });
      const due = await db.query.revisionItems.findMany({
        where: and(eq(revisionItems.ownerId, user.id), eq(revisionItems.chapterId, chapter.id)),
      });
      const dueNow = due.filter((r) => r.nextReviewAt.getTime() <= Date.now()).length;

      const mastery = computeMastery({ attempts, revisionSuccesses: 0, unresolvedMistakes: unresolved.length });

      return {
        chapterId: chapter.id, textbookId: chapter.textbookId, title: chapter.title, subject: '',
        masteryState: mastery.state, masteryScore: mastery.score,
        unresolvedMistakes: unresolved.length, revisionDueCount: dueNow, pageCount: 0,
      };
    }));

    const nextExam = await db.query.examDates.findFirst({ where: eq(examDates.ownerId, user.id) });

    const rec = dailyRecommendation(plannerChapters, { examOn: nextExam?.examOn ?? null });
    return NextResponse.json(rec);
  } catch (err) {
    return handleError(err, 'api.coach_today.failed');
  }
}
