import { NextResponse, type NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks, textbookChunks, textbookChapters } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { buildKnowledgeGraph } from '@/lib/knowledge/graph';
import { handleError } from '@/lib/http';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ textbookId: string }> }) {
  try {
    const user = await requireUser();
    const { textbookId } = await ctx.params;

    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, textbookId) });
    assertOwnership(user, book);

    const rows = await db
      .select({
        chunkId: textbookChunks.id,
        chapterId: textbookChunks.chapterId,
        chapterTitle: textbookChapters.title,
        section: textbookChunks.section,
        pageNumber: textbookChunks.pageNumber,
        text: textbookChunks.text,
        sourceType: textbookChunks.sourceType,
      })
      .from(textbookChunks)
      .leftJoin(textbookChapters, eq(textbookChapters.id, textbookChunks.chapterId))
      .where(and(
        eq(textbookChunks.textbookId, textbookId),
        eq(textbookChunks.ownerId, user.id),
      ));

    const graph = buildKnowledgeGraph(rows.map((r) => ({
      chunkId: r.chunkId,
      chapterId: r.chapterId,
      chapterTitle: r.chapterTitle,
      section: r.section,
      pageNumber: r.pageNumber,
      text: r.text,
      sourceType: r.sourceType,
    })));

    // chunkIds are internal; the client only needs labels, kinds and pages.
    return NextResponse.json({
      nodes: graph.nodes.map(({ chunkIds, ...n }) => n),
      edges: graph.edges,
    });
  } catch (err) {
    return handleError(err, 'api.knowledge_graph.failed');
  }
}
