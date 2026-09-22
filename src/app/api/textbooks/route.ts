import { NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChapters } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();

    const rows = await db
      .select({
        id: textbooks.id, title: textbooks.title, classLabel: textbooks.classLabel,
        pageCount: textbooks.pageCount, status: textbooks.status,
        isDemo: textbooks.isDemo, createdAt: textbooks.createdAt,
        chapterCount: count(textbookChapters.id),
      })
      .from(textbooks)
      .leftJoin(textbookChapters, eq(textbookChapters.textbookId, textbooks.id))
      .where(eq(textbooks.ownerId, user.id))
      .groupBy(textbooks.id)
      .orderBy(desc(textbooks.createdAt));

    return NextResponse.json(rows.map((r) => ({
      id: r.id, title: r.title, classLabel: r.classLabel,
      pageCount: r.pageCount, chapterCount: Number(r.chapterCount),
      status: r.status, isDemo: r.isDemo, createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    return handleError(err, 'api.textbooks_list.failed');
  }
}
