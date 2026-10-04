-- Run AFTER the generated table migrations.
-- EMBEDDING_DIM must match the value used in src/db/schema.ts.

-- Approximate nearest-neighbour index for semantic retrieval.
-- HNSW gives better recall/latency than IVFFlat for this workload size.
CREATE INDEX IF NOT EXISTS chunk_embeddings_hnsw
  ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text index for the keyword half of hybrid retrieval.
-- 'simple' config is used deliberately: Postgres has no Bangla stemmer, and
-- 'english' stemming would mangle Bangla tokens. Trigram index below covers
-- fuzzy/substring matching for both scripts.
ALTER TABLE textbook_chunks
  ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED;

CREATE INDEX IF NOT EXISTS chunks_fts_idx ON textbook_chunks USING gin (text_search);
CREATE INDEX IF NOT EXISTS chunks_trgm_idx ON textbook_chunks USING gin (text gin_trgm_ops);

-- Composite index supporting the scoped-retrieval hot path:
-- "this owner, this textbook, this chapter".
CREATE INDEX IF NOT EXISTS chunks_scope_idx
  ON textbook_chunks (owner_id, textbook_id, chapter_id, page_number);
