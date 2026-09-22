import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db';
import { mistakes, questions, textbooks, textbookChapters } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const textbookId = req.nextUrl.searchParams.get('textbookId');

    const rows = await db
      .select({
        id: mistakes.id, kind: mistakes.kind, occurrences: mistakes.occurrences,
        resolved: mistakes.resolved, lastOccurredAt: mistakes.lastOccurredAt,
        question: questions.prompt, correctAnswer: questions.correctAnswer, explanation: questions.explanation,
        chapterTitle: textbookChapters.title, chapterId: mistakes.chapterId,
        textbookTitle: textbooks.title,
      })
      .from(mistakes)
      .leftJoin(questions, eq(questions.id, mistakes.questionId))
      .leftJoin(textbookChapters, eq(textbookChapters.id, mistakes.chapterId))
      .leftJoin(textbooks, eq(textbooks.id, mistakes.textbookId))
      .where(textbookId
        ? and(eq(mistakes.ownerId, user.id), eq(mistakes.textbookId, textbookId))
        : eq(mistakes.ownerId, user.id))
      .orderBy(desc(mistakes.lastOccurredAt))
      .limit(100);

    return NextResponse.json(rows.map((r) => ({
      id: r.id, kind: r.kind, occurrences: r.occurrences, resolved: r.resolved,
      lastOccurredAt: r.lastOccurredAt.toISOString(),
      question: r.question, correctAnswer: r.correctAnswer, explanation: r.explanation,
      chapterId: r.chapterId, chapterTitle: r.chapterTitle, textbookTitle: r.textbookTitle,
    })));
  } catch (err) {
    return handleError(err, 'api.mistakes_list.failed');
  }
}
