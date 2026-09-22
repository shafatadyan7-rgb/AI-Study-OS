import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { quizAttempts, quizAnswers, questions, questionOptions, mistakes } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const Body = z.object({
  questionId: z.string().uuid(),
  optionId: z.string().uuid(),
  secondsSpent: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const { attemptId } = await ctx.params;
    const body = Body.parse(await req.json());

    const attempt = await db.query.quizAttempts.findFirst({ where: eq(quizAttempts.id, attemptId) });
    assertOwnership(user, attempt);

    const question = await db.query.questions.findFirst({ where: eq(questions.id, body.questionId) });
    assertOwnership(user, question);

    const option = await db.query.questionOptions.findFirst({ where: eq(questionOptions.id, body.optionId) });
    if (!option || option.questionId !== body.questionId) {
      return NextResponse.json({ error: 'That option does not belong to this question.' }, { status: 400 });
    }

    const isCorrect = option.isCorrect;
    await db.insert(quizAnswers).values({
      attemptId, ownerId: user.id, questionId: body.questionId,
      givenAnswer: option.text, isCorrect, secondsSpent: body.secondsSpent ?? null,
    });

    if (isCorrect) {
      await db.update(quizAttempts).set({ score: (attempt!.score ?? 0) + 1 }).where(eq(quizAttempts.id, attemptId));
    } else {
      const correctOption = await db.query.questionOptions.findFirst({
        where: and(eq(questionOptions.questionId, body.questionId), eq(questionOptions.isCorrect, true)),
      });
      const existing = await db.query.mistakes.findFirst({
        where: and(eq(mistakes.ownerId, user.id), eq(mistakes.questionId, body.questionId)),
      });
      if (existing) {
        await db.update(mistakes).set({
          occurrences: existing.occurrences + 1, resolved: false, lastOccurredAt: new Date(),
        }).where(eq(mistakes.id, existing.id));
      } else {
        await db.insert(mistakes).values({
          ownerId: user.id, questionId: body.questionId, textbookId: question!.textbookId,
          chapterId: question!.chapterId, kind: 'unclassified',
        });
      }
      return NextResponse.json({
        isCorrect: false, correctAnswer: correctOption?.text ?? question!.correctAnswer, explanation: question!.explanation,
      });
    }

    return NextResponse.json({ isCorrect: true, explanation: question!.explanation });
  } catch (err) {
    return handleError(err, 'api.quiz_answer.failed');
  }
}
