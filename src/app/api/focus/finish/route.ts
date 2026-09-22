import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { studySessions } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const Body = z.object({
  sessionId: z.string().uuid(),
  reflection: z.string().max(2000).optional(),
  confidence: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());

    const session = await db.query.studySessions.findFirst({
      where: eq(studySessions.id, body.sessionId),
    });
    assertOwnership(user, session);

    // Duration is computed from the stored start time, not sent by the client —
    // otherwise a student could inflate their own study analytics.
    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - session!.startedAt.getTime()) / 1000),
    );

    await db.update(studySessions).set({
      endedAt,
      durationSeconds,
      reflection: body.reflection ?? null,
      confidence: body.confidence ?? null,
    }).where(eq(studySessions.id, body.sessionId));

    return NextResponse.json({ durationSeconds });
  } catch (err) {
    return handleError(err, 'api.focus_finish.failed');
  }
}
