import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { embeddings } from '@/lib/ai';

export type Scope = 'page' | 'chapter' | 'textbook' | 'library';

export interface RetrievalRequest {
  ownerId: string;
  query: string;
  scope: Scope;
  textbookId?: string;
  chapterId?: string;
  pageNumber?: number;
  limit?: number;
}

export interface RetrievedChunk {
  chunkId: string;
  textbookId: string;
  textbookTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  pageNumber: number;
  section: string | null;
  text: string;
  semanticRank: number | null;
  keywordRank: number | null;
  score: number;
}

const CANDIDATES = 40;
const DEFAULT_LIMIT = 8;
const RRF_K = 60;

/**
 * Reciprocal Rank Fusion. Chosen over score normalisation because cosine
 * distance and ts_rank live on incomparable scales — fusing by *rank* avoids
 * one signal silently dominating whenever its raw scores happen to be larger.
 */
function rrf(rank: number): number {
  return 1 / (RRF_K + rank);
}

/**
 * Hybrid retrieval over the student's own chunks.
 *
 * Owner filtering is applied inside both SQL branches rather than afterwards in
 * TypeScript: a post-filter would mean another student's content briefly entered
 * the candidate set, and one forgotten guard would leak it.
 */
export async function retrieve(req: RetrievalRequest): Promise<RetrievedChunk[]> {
  const limit = req.limit ?? DEFAULT_LIMIT;

  // Scope narrowing. Each clause is additive and owner_id is always present.
  const scopeSql = (() => {
    switch (req.scope) {
      case 'page':
        if (!req.textbookId || req.pageNumber === undefined) {
          throw new Error('Page scope requires textbookId and pageNumber.');
        }
        return sql`AND c.textbook_id = ${req.textbookId} AND c.page_number = ${req.pageNumber}`;
      case 'chapter':
        if (!req.textbookId || !req.chapterId) {
          throw new Error('Chapter scope requires textbookId and chapterId.');
        }
        return sql`AND c.textbook_id = ${req.textbookId} AND c.chapter_id = ${req.chapterId}`;
      case 'textbook':
        if (!req.textbookId) throw new Error('Textbook scope requires textbookId.');
        return sql`AND c.textbook_id = ${req.textbookId}`;
      case 'library':
        return sql``;
    }
  })();

  const [queryVector] = await embeddings().embed([req.query], 'query');
  if (!queryVector) throw new Error('Query embedding failed.');
  const vectorLiteral = `[${queryVector.join(',')}]`;

  const rows = await db.execute(sql`
    WITH semantic AS (
      SELECT c.id,
             ROW_NUMBER() OVER (ORDER BY e.embedding <=> ${vectorLiteral}::vector) AS rank
      FROM textbook_chunks c
      JOIN chunk_embeddings e ON e.chunk_id = c.id
      WHERE c.owner_id = ${req.ownerId}
      ${scopeSql}
      ORDER BY e.embedding <=> ${vectorLiteral}::vector
      LIMIT ${CANDIDATES}
    ),
    keyword AS (
      SELECT c.id,
             ROW_NUMBER() OVER (
               ORDER BY ts_rank(c.text_search, plainto_tsquery('simple', ${req.query})) DESC
             ) AS rank
      FROM textbook_chunks c
      WHERE c.owner_id = ${req.ownerId}
        AND c.text_search @@ plainto_tsquery('simple', ${req.query})
      ${scopeSql}
      LIMIT ${CANDIDATES}
    ),
    fused AS (
      SELECT COALESCE(s.id, k.id) AS id,
             s.rank AS semantic_rank,
             k.rank AS keyword_rank,
             COALESCE(1.0 / (${RRF_K} + s.rank), 0) + COALESCE(1.0 / (${RRF_K} + k.rank), 0) AS score
      FROM semantic s
      FULL OUTER JOIN keyword k ON k.id = s.id
    )
    SELECT f.id            AS chunk_id,
           f.semantic_rank,
           f.keyword_rank,
           f.score,
           c.textbook_id,
           c.chapter_id,
           c.page_number,
           c.section,
           c.text,
           t.title         AS textbook_title,
           ch.title        AS chapter_title
    FROM fused f
    JOIN textbook_chunks c  ON c.id = f.id
    JOIN textbooks t        ON t.id = c.textbook_id
    LEFT JOIN textbook_chapters ch ON ch.id = c.chapter_id
    WHERE c.owner_id = ${req.ownerId}
    ORDER BY f.score DESC
    LIMIT ${limit}
  `);

  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    chunkId: String(r.chunk_id),
    textbookId: String(r.textbook_id),
    textbookTitle: String(r.textbook_title),
    chapterId: r.chapter_id ? String(r.chapter_id) : null,
    chapterTitle: r.chapter_title ? String(r.chapter_title) : null,
    pageNumber: Number(r.page_number),
    section: r.section ? String(r.section) : null,
    text: String(r.text),
    semanticRank: r.semantic_rank === null ? null : Number(r.semantic_rank),
    keywordRank: r.keyword_rank === null ? null : Number(r.keyword_rank),
    score: Number(r.score),
  }));
}

/** Pure function extracted for unit testing without a database. */
export function fuseRanks(
  semantic: string[],
  keyword: string[],
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  semantic.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + rrf(i + 1)));
  keyword.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + rrf(i + 1)));
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
