import { NextResponse, type NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChapters, quizAttempts, quizAnswers, mistakes, revisionItems } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { computeMastery, type AttemptSignal } from '@/lib/learning/mastery';
import { handleError } from '@/lib/http';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const textbookId = req.nextUrl.searchParams.get('textbookId');
    if (!textbookId) return NextResponse.json({ error: 'textbookId is required.' }, { status: 400 });

    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, textbookId) });
    assertOwnership(user, book);

    const chapters = await db.query.textbookChapters.findMany({
      where: eq(textbookChapters.textbookId, textbookId),
    });

    const results = await Promise.all(chapters.map(async (chapter) => {
      const answers = await db
        .select({
          isCorrect: quizAnswers.isCorrect, answeredAt: quizAnswers.answeredAt,
        })
        .from(quizAnswers)
        .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
        .where(and(
          eq(quizAnswers.ownerId, user.id),
          eq(quizAttempts.chapterId, chapter.id),
        ));

      const attempts: AttemptSignal[] = answers.map((a) => ({
        correct: a.isCorrect, answeredAt: a.answeredAt,
        difficulty: 'medium', questionType: 'mcq',
      }));

      const unresolved = await db.query.mistakes.findMany({
        where: and(eq(mistakes.ownerId, user.id), eq(mistakes.chapterId, chapter.id), eq(mistakes.resolved, false)),
      });

      const revised = await db.query.revisionItems.findMany({
        where: and(eq(revisionItems.ownerId, user.id), eq(revisionItems.chapterId, chapter.id)),
      });

      const result = computeMastery({
        attempts,
        revisionSuccesses: revised.filter((r) => r.repetitions > 0).length,
        unresolvedMistakes: unresolved.length,
      });

      return {
        chapterId: chapter.id, chapterTitle: chapter.title,
        state: result.state, score: result.score, signalCount: result.signalCount, reason: result.reason,
      };
    }));

    return NextResponse.json(results);
  } catch (err) {
    return handleError(err, 'api.mastery.failed');
  }
}
