import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/db';
import { mistakes } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

/**
 * Identifies the chapter with the most unresolved mistakes and returns it so
 * the client can call /api/quiz/generate with kind: 'targeted_practice' for
 * that chapter. This route decides *what* to practice; quiz generation still
 * does the actual generation, so there is exactly one place questions are made.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.query.mistakes.findMany({
      where: and(eq(mistakes.ownerId, user.id), eq(mistakes.resolved, false)),
      orderBy: [desc(mistakes.occurrences)],
    });
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No unresolved mistakes to practice yet.' }, { status: 404 });
    }

    const byChapter = new Map<string, number>();
    for (const m of rows) {
      if (!m.chapterId) continue;
      byChapter.set(m.chapterId, (byChapter.get(m.chapterId) ?? 0) + m.occurrences);
    }
    const worst = [...byChapter.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!worst) return NextResponse.json({ error: 'No chapter-linked mistakes to practice yet.' }, { status: 404 });

    return NextResponse.json({ chapterId: worst[0], mistakeWeight: worst[1] });
  } catch (err) {
    return handleError(err, 'api.mistakes_practice.failed');
  }
}
