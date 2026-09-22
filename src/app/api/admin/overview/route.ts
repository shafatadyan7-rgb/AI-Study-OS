import { NextResponse } from 'next/server';
import { count, eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { users, textbooks, processingJobs } from '@/db/schema';
import { requireRole } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

/** System health and counts only. Never returns textbook content or student
 *  AI conversations — admin manages the platform, not student learning data. */
export async function GET() {
  try {
    await requireRole('admin');

    const [userCount] = await db.select({ n: count() }).from(users);
    const [textbookCount] = await db.select({ n: count() }).from(textbooks);
    const recentJobs = await db
      .select({ id: processingJobs.id, status: processingJobs.status, error: processingJobs.error, updatedAt: processingJobs.updatedAt })
      .from(processingJobs).orderBy(desc(processingJobs.updatedAt)).limit(20);
    const failedJobs = recentJobs.filter((j) => j.status === 'failed').length;

    return NextResponse.json({
      userCount: userCount!.n,
      textbookCount: textbookCount!.n,
      recentJobs: recentJobs.map((j) => ({ ...j, updatedAt: j.updatedAt.toISOString() })),
      failedJobsInWindow: failedJobs,
    });
  } catch (err) {
    return handleError(err, 'api.admin_overview.failed');
  }
}
