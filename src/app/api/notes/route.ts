import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { db } from '@/db';
import { notes, textbooks, textbookChapters } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const textbookId = req.nextUrl.searchParams.get('textbookId');
    const chapterId = req.nextUrl.searchParams.get('chapterId');
    const search = req.nextUrl.searchParams.get('q');

    const conditions = [eq(notes.ownerId, user.id)];
    if (textbookId) conditions.push(eq(notes.textbookId, textbookId));
    if (chapterId) conditions.push(eq(notes.chapterId, chapterId));
    if (search) conditions.push(or(ilike(notes.title, `%${search}%`), ilike(notes.body, `%${search}%`))!);

    const rows = await db
      .select({
        id: notes.id, title: notes.title, body: notes.body, mode: notes.mode,
        pinned: notes.pinned, favorite: notes.favorite, aiGenerated: notes.aiGenerated,
        createdAt: notes.createdAt, updatedAt: notes.updatedAt,
        textbookTitle: textbooks.title, chapterTitle: textbookChapters.title,
      })
      .from(notes)
      .leftJoin(textbooks, eq(textbooks.id, notes.textbookId))
      .leftJoin(textbookChapters, eq(textbookChapters.id, notes.chapterId))
      .where(and(...conditions))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));

    return NextResponse.json(rows.map((r) => ({
      ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) {
    return handleError(err, 'api.notes_list.failed');
  }
}

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20000).default(''),
  textbookId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
});

/** Manual note creation. For AI-generated notes see /api/notes/generate. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = CreateBody.parse(await req.json());

    if (body.chapterId) {
      const chapter = await db.query.textbookChapters.findFirst({ where: eq(textbookChapters.id, body.chapterId) });
      assertOwnership(user, chapter);
    }

    const [row] = await db.insert(notes).values({
      ownerId: user.id, textbookId: body.textbookId ?? null, chapterId: body.chapterId ?? null,
      title: body.title, body: body.body, mode: 'manual', aiGenerated: false,
    }).returning({ id: notes.id });

    return NextResponse.json({ id: row!.id });
  } catch (err) {
    return handleError(err, 'api.notes_create.failed');
  }
}
