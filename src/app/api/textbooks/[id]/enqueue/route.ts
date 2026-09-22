import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, processingJobs } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { textbookQueue, TEXTBOOK_QUEUE } from '@/lib/queue';
import { handleError } from '@/lib/http';

const Body = z.object({ jobId: z.string().uuid() });

/**
 * Called once the browser's presigned PUT to S3 has finished. Separated from
 * upload-url so the job is only queued after the bytes have actually landed —
 * queuing at ticket-issue time would let a job run against a file that never arrived.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());

    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, id) });
    assertOwnership(user, book);

    const job = await db.query.processingJobs.findFirst({ where: eq(processingJobs.id, body.jobId) });
    assertOwnership(user, job);
    if (job!.textbookId !== id) {
      return NextResponse.json({ error: 'Job does not belong to this textbook.' }, { status: 400 });
    }

    await db.update(textbooks).set({ status: 'uploaded', updatedAt: new Date() }).where(eq(textbooks.id, id));
    await textbookQueue().add(TEXTBOOK_QUEUE, { textbookId: id, ownerId: user.id, jobId: job!.id });

    return NextResponse.json({ queued: true });
  } catch (err) {
    return handleError(err, 'api.enqueue.failed');
  }
}
