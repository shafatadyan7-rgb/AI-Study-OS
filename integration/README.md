# Integration tests

**Status: written, NOT YET RUN.** These require live infrastructure that was not
available when they were authored. Do not treat them as passing until you have
run them yourself against the stack below.

## What they need

| Service | Purpose |
|---|---|
| PostgreSQL 15+ with `pgvector` | schema, hybrid retrieval |
| Redis | BullMQ queue, rate limiting |
| S3-compatible storage (MinIO is fine) | PDF upload/download |
| Embedding API key | real vectors; there is no offline stub |
| LLM API key | RAG answering |

Bring the infrastructure up with the provided compose file:

```bash
docker compose -f ../docker-compose.yml up -d postgres redis minio
cp ../.env.example ../.env.test   # point DATABASE_URL at the test database
npm run test:integration
```

`npm run test:integration` is a no-op that exits non-zero with an explanation if
`DATABASE_URL` is unset, so it cannot silently "pass" with no database.

## Coverage

- `db.test.ts` — migrations apply; pgvector extension present; HNSW index exists
- `retrieval.test.ts` — embed → store → hybrid retrieve returns the right chunk;
  a second user's identical query returns **zero** rows from the first user's book
- `pipeline.test.ts` — upload a fixture PDF, run the worker job, assert the real
  stage sequence and that pages/chunks/embeddings all land
- `authz.test.ts` — every API route returns 401 unauthenticated and 403 for a
  non-owner, driven from the route manifest rather than a hand-maintained list
- `quiz-flow.test.ts` — generate → answer wrong → mistake row created → mastery
  recomputed → revision item scheduled

## The one that matters most

`retrieval.test.ts` is the cross-student isolation test. It creates two students,
gives each a textbook with deliberately overlapping content, and asserts that
Student A's query never returns a chunk owned by Student B — at the SQL level,
not after a filter in application code.
