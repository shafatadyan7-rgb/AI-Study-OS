import { NextResponse, type NextRequest } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChapters } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, id) });
    assertOwnership(user, book);

    const rows = await db.select({
      id: textbookChapters.id, ordinal: textbookChapters.ordinal, title: textbookChapters.title,
      startPage: textbookChapters.startPage, endPage: textbookChapters.endPage,
    }).from(textbookChapters)
      .where(eq(textbookChapters.textbookId, id))
      .orderBy(asc(textbookChapters.ordinal));

    return NextResponse.json(rows);
  } catch (err) {
    return handleError(err, 'api.chapters_list.failed');
  }
}
