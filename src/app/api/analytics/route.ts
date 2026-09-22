import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { quizAnswers, studySessions, mistakes } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import {
  accuracy, accuracyDelta, accuracyTrend, studyMinutesTrend,
  mistakeBreakdown, currentStreak,
} from '@/lib/analytics/aggregate';
import { handleError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();

    const answers = await db.query.quizAnswers.findMany({ where: eq(quizAnswers.ownerId, user.id) });
    const sessions = await db.query.studySessions.findMany({ where: eq(studySessions.ownerId, user.id) });
    const mistakeRows = await db.query.mistakes.findMany({ where: eq(mistakes.ownerId, user.id) });

    const attemptRows = answers.map((a) => ({ answeredAt: a.answeredAt, isCorrect: a.isCorrect, chapterId: null }));
    const sessionRows = sessions.map((s) => ({ startedAt: s.startedAt, durationSeconds: s.durationSeconds }));

    return NextResponse.json({
      accuracy: accuracy(attemptRows),
      accuracyDelta: accuracyDelta(attemptRows),
      accuracyTrend: accuracyTrend(attemptRows),
      studyMinutesTrend: studyMinutesTrend(sessionRows),
      mistakeBreakdown: mistakeBreakdown(mistakeRows.map((m) => ({ kind: m.kind, resolved: m.resolved }))),
      streak: currentStreak(sessionRows),
      questionsAttempted: answers.length,
    });
  } catch (err) {
    return handleError(err, 'api.analytics.failed');
  }
}
