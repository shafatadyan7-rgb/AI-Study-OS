import { NextResponse, type NextRequest } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, processingJobs } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

/** Polled by the UI during processing. Returns the real stage, never a timer. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, id) });
    assertOwnership(user, book);

    const job = await db.query.processingJobs.findFirst({
      where: eq(processingJobs.textbookId, id),
      orderBy: [desc(processingJobs.updatedAt)],
    });

    return NextResponse.json({
      status: book!.status,
      pageCount: book!.pageCount,
      progress: job?.progress ?? 0,
      stageDetail: job?.stageDetail ?? null,
      error: job?.error ?? null,
    });
  } catch (err) {
    return handleError(err, 'api.textbook_status.failed');
  }
}
