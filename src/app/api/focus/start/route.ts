import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { studySessions } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const Body = z.object({
  activity: z.enum(['read', 'quiz', 'flashcards', 'focus', 'revision']),
  textbookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());
    const [session] = await db.insert(studySessions).values({
      ownerId: user.id,
      activity: body.activity,
      textbookId: body.textbookId ?? null,
      chapterId: body.chapterId ?? null,
    }).returning({ id: studySessions.id });
    return NextResponse.json({ sessionId: session!.id });
  } catch (err) {
    return handleError(err, 'api.focus_start.failed');
  }
}
