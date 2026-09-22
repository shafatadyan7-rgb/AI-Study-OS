# AI StudyOS

**Your Personal AI Learning Operating System.**

Upload a textbook PDF. AI StudyOS extracts it, structures it, indexes it, and turns
it into a grounded AI tutor, notes, flashcards, quizzes, a mistake lab, and an
adaptive study plan — all built on *your* textbook, with real page citations.

---

## Status

This repository is the **Phase 2 production backend**, built on top of a working
prototype. It is deliberately explicit about what is implemented and what is not.

| Area | Status |
|---|---|
| Database schema + migrations | Implemented |
| Auth (scrypt, signed sessions, roles, ownership guard) | Implemented |
| Object storage (S3-compatible, presigned, private) | Implemented |
| Background processing (BullMQ, real stage progress) | Implemented |
| PDF extraction, Bangla OCR, semantic chunking, embeddings | Implemented |
| Hybrid retrieval (pgvector + FTS, RRF), grounded RAG, streaming tutor | Implemented |
| Prompt-injection defence | Implemented + tested against real injection strings |
| Mastery / revision / planner / coach engines | Implemented + unit tested |
| Knowledge graph, question scanner (incl. image OCR), analytics | Implemented + unit tested |
| Notes, Projects, Skills, Career, Achievements | Implemented + unit tested |
| Teacher / Parent / Admin dashboards, privacy projection | Implemented + unit tested |
| Full design system, all pages wired to real APIs | Implemented |
| Demo seed runner + carnival Presentation Mode | Implemented, idempotent by inspection |
| Embedding dimension safety guard | Implemented + tested (fails loudly on mismatch) |
| Accessibility: skip link, dialog semantics, icon-button labels, reduced motion | Implemented + statically tested |
| Docker + compose infrastructure | Implemented |
| `npm run build` | **Succeeds — verified, no database required** |
| Integration test scaffolding | Written, **never run against live infrastructure** |
| Screen-reader verification | **Not done — requires manual testing, see PRODUCTION_CHECKLIST.md** |
| Color contrast measurement with a real tool | **Not done** |
| Single-project detail view, career admin authoring UI, scanner history | **Not built** |

---

## Architecture

```
Browser
  │  presigned PUT (PDF never transits the app server)
  ▼
S3-compatible object storage ──────┐
  │                                │
  │ enqueue job                    │ worker fetches
  ▼                                ▼
Redis (BullMQ) ──────────► Worker process
                             │
                             ├─ extract text layer (page-accurate)
                             ├─ OCR if the layer is too sparse
                             ├─ detect chapters (heuristic)
                             ├─ semantic chunking
                             └─ embed → pgvector
                                     │
Next.js API ◄────── hybrid retrieval ┘
  │   (pgvector cosine ⊕ Postgres FTS, fused by RRF)
  ▼
LLM provider (abstracted) ──► grounded answer + real page citations
```

### Why these choices

- **RRF over score normalisation.** Cosine distance and `ts_rank` are on
  incomparable scales. Fusing by *rank* stops one signal silently dominating.
- **`simple` text-search config, not `english`.** Postgres has no Bangla stemmer,
  and English stemming mangles Bangla tokens. A trigram index covers fuzzy matching
  for both scripts.
- **Owner filtering inside SQL, never after it.** A post-filter in TypeScript means
  another student's rows entered the candidate set. One forgotten guard leaks them.
- **Evidence sufficiency checked before the LLM call.** Asking a model to answer on
  thin evidence and hoping it declines is how fabricated citations get produced.

---

## Requirements

- Node.js 20+
- PostgreSQL 15+ **with the `pgvector` extension available**
- Redis 6+
- S3-compatible storage (AWS S3, Cloudflare R2, or MinIO locally)
- An LLM API key and an embeddings API key
- *(Optional, for scanned PDFs)* `tesseract-ocr`, language packs, and `poppler-utils`
  on the worker host:
  ```bash
  apt-get install -y tesseract-ocr tesseract-ocr-ben tesseract-ocr-eng poppler-utils
  ```

---

## Setup

```bash
cp .env.example .env     # then fill in every value
npm install
```

### Database

`pgvector` must be enabled before the table migrations run:

```bash
psql "$DATABASE_URL" -f drizzle/0000_pgvector_setup.sql
npm run db:generate      # generate table migrations from the schema
npm run db:migrate
psql "$DATABASE_URL" -f drizzle/9999_search_indexes.sql   # HNSW + FTS + trigram indexes
```

> **`EMBEDDING_DIM` must match your embedding model.** `voyage-3` is 1024;
> `text-embedding-3-small` is 1536. Changing it later requires re-embedding every
> chunk, because the `vector(n)` column type is fixed at migration time.

### Running

```bash
npm run dev       # Next.js app
npm run worker    # background processor — must run for uploads to complete
npm test          # 69 unit tests, no database required
npm run typecheck
```

The worker is a **separate process**. Without it, uploads sit at `uploading` forever.
In production run at least one worker replica; `WORKER_CONCURRENCY` defaults to 2
because extraction and OCR are CPU-bound.

---

## Environment variables

See `.env.example` for the full list. The ones without safe defaults:

| Variable | Why it is required |
|---|---|
| `DATABASE_URL` | Postgres with pgvector |
| `REDIS_URL` | Job queue and rate limiting |
| `SESSION_SECRET` | Signs session cookies. `openssl rand -base64 32` |
| `AI_API_KEY` | LLM. **There is no offline fallback** — the tutor errors rather than inventing answers |
| `EMBEDDING_API_KEY` | Embeddings. Without it, retrieval cannot run |
| `S3_*` | Private bucket for uploaded PDFs |
| `OCR_PROVIDER` | Leave `none` to fail scanned PDFs cleanly instead of silently |

---

## Security model

Data isolation is the load-bearing security property. Three independent layers:

1. **Schema** — every student-owned table carries a non-null `owner_id`.
2. **Query** — `owner_id` is filtered inside the SQL of both retrieval branches.
3. **Handler** — `assertOwnership()` throws before any resource is returned.

Enforced by tests in `tests/isolation.test.ts`, which also scan the source to catch
the likeliest regression: a new query added without an owner filter, or a route
handler that touches the database before calling `requireUser()`.

Other measures: scrypt password hashing with per-password salts and constant-time
comparison; HMAC-signed session ids (a stolen database row cannot be replayed);
identical `Not found or not yours.` for both missing and forbidden records, so
textbook ids cannot be enumerated; per-user rate limits on AI and upload routes;
uploaded textbook text treated as untrusted input and sanitised before reaching a
prompt; structured logs that never contain textbook content.

Teachers and parents have no ownership over student records. Aggregate class
analytics must be served by separate, purpose-built queries — never by granting
`assertOwnership` an exception.

---

## Testing

```
tests/learning.test.ts    mastery, revision, planner, coach, chunking,
                          chapter detection, RRF fusion, injection defence
tests/isolation.test.ts   ownership guard, password hashing, schema invariants,
                          route authentication, owner-scoped SQL
tests/product.test.ts     knowledge graph, concept extraction, analytics
                          honesty, question scanner, teacher/parent privacy
```

116 unit tests. The route-authentication tests are generated by walking
`src/app/api`, so a new route added without `requireUser()` fails the suite
automatically rather than waiting for someone to notice in review.

The mastery tests encode the product's anti-fabrication rules directly: a single
correct answer can never yield `mastered`; thin evidence returns `null` so the UI
renders NOT ENOUGH DATA rather than a zero; unresolved mistakes block mastery;
crammed same-day practice does not qualify as sustained performance.

These run without a database, Redis, or API keys.

Integration tests are **written but have never been run** — they need live
Postgres, Redis, S3 and API keys. `npm run test:integration` exits non-zero with
an explanation when infrastructure is missing, so an unconfigured run cannot be
mistaken for a green suite. See `integration/README.md`.

---

## Deployment

Local infrastructure:

```bash
docker compose up -d postgres redis minio
```

The `Dockerfile` has separate `web` and `worker` targets. OCR binaries
(`tesseract`, `poppler-utils`) are installed **only in the worker image** — the
web tier never rasterises a PDF, so shipping them there would be dead weight and
extra attack surface.

1. Provision Postgres with pgvector, Redis, and a **private** object storage bucket.
2. Set every variable from `.env.example`.
3. Run the three migration steps above.
4. Deploy the Next.js app (`npm run build && npm start`).
5. Deploy the worker as a **separate long-running process**, not a serverless
   function — jobs outlive typical function timeouts.
6. Scale workers by CPU; scale the app by request volume. They scale independently
   on purpose.

Observability: all logs are structured JSON on stdout. Key events are
`processing.start`, `processing.ready`, `processing.failed`, `worker.job_failed`,
and `rag.answer` (which records latency, scope, and mode — never textbook text).

---

## User content

Uploaded textbooks stay private to the uploading student. They are stored in a
private bucket, served only through short-lived presigned URLs minted after an
ownership check, and never exposed to another user or aggregated into a shared
corpus. `DELETE` on a textbook removes the object and cascades all derived rows.

---

## Known limitations

- **Rate limiting requires Redis.** `rateLimit()` calls `redis()` directly; if
  Redis is unreachable, the call throws rather than silently allowing the
  request through — this is a deliberate fail-closed choice for auth/AI routes,
  but it means those routes are unavailable, not just unlimited, if Redis is down.
- **Career and Skills pages are empty until seeded.** `career_paths` and
  `skill_categories` have no seed data in this repository — they are
  read-only reference tables an administrator populates. The UI shows an
  honest empty state, not fabricated entries.
- **The question scanner has no history view.** `scanned_questions` rows are
  written for audit purposes but nothing currently reads them back.
- **BullMQ build warning.** `next build` prints a module-not-found warning for
  an optional Valkey client BullMQ tries to bundle. It does not affect
  functionality (BullMQ falls back to its standard Redis client) — see
  `PRODUCTION_CHECKLIST.md` for the one-line fix if you want a silent build.
- **`npm run build` succeeds without a database** — Next.js does not need to
  execute route handlers to trace them, only to type them. This does **not**
  mean the routes work against a live database; see `ROUTES.md` for what is
  and isn't verified.

See `PRODUCTION_CHECKLIST.md` for the full CODE VERIFIED vs. REQUIRES LIVE
INFRASTRUCTURE breakdown, and `ROUTES.md` for a route-by-route inventory.
