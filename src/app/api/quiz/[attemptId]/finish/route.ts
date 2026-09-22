import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { quizAttempts } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    const user = await requireUser();
    const { attemptId } = await ctx.params;
    const attempt = await db.query.quizAttempts.findFirst({ where: eq(quizAttempts.id, attemptId) });
    assertOwnership(user, attempt);

    await db.update(quizAttempts).set({ finishedAt: new Date() }).where(eq(quizAttempts.id, attemptId));
    return NextResponse.json({ score: attempt!.score, total: attempt!.total });
  } catch (err) {
    return handleError(err, 'api.quiz_finish.failed');
  }
}
