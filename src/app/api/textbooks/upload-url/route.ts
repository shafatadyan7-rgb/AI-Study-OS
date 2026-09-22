import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, processingJobs } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { presignUpload, textbookKey } from '@/lib/storage/s3';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const Body = z.object({
  title: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  classLabel: z.string().max(40).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.window);
    const body = Body.parse(await req.json());

    const max = Number(process.env.MAX_UPLOAD_BYTES ?? 104_857_600);
    if (body.byteSize > max) {
      return NextResponse.json(
        { error: `That file is larger than the ${Math.round(max / 1_048_576)}MB limit.` },
        { status: 413 },
      );
    }

    const [book] = await db.insert(textbooks).values({
      ownerId: user.id,
      title: body.title,
      classLabel: body.classLabel ?? null,
      storageKey: 'pending',
      byteSize: body.byteSize,
      status: 'uploading',
    }).returning({ id: textbooks.id });

    const key = textbookKey(user.id, book!.id);
    await db.update(textbooks).set({ storageKey: key }).where(eq(textbooks.id, book!.id));

    const [job] = await db.insert(processingJobs).values({
      textbookId: book!.id, ownerId: user.id, status: 'uploading', progress: 0,
    }).returning({ id: processingJobs.id });

    return NextResponse.json({
      textbookId: book!.id,
      jobId: job!.id,
      uploadUrl: await presignUpload(key),
    });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.upload_url.failed');
  }
}
