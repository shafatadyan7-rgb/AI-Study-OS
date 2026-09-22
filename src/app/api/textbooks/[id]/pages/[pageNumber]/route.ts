import { NextResponse, type NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookPages } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; pageNumber: string }> },
) {
  try {
    const user = await requireUser();
    const { id, pageNumber } = await ctx.params;
    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, id) });
    assertOwnership(user, book);

    const page = await db.query.textbookPages.findFirst({
      where: and(eq(textbookPages.textbookId, id), eq(textbookPages.pageNumber, Number(pageNumber))),
    });
    if (!page) return NextResponse.json({ error: 'Page not found.' }, { status: 404 });

    return NextResponse.json({
      pageNumber: page.pageNumber, text: page.text, extractedBy: page.extractedBy,
    });
  } catch (err) {
    return handleError(err, 'api.page_read.failed');
  }
}
