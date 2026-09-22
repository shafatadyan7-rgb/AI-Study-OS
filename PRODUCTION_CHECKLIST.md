# AI StudyOS — Production Checklist

Two kinds of checkmark live in this document, and they mean different things:

- **CODE VERIFIED** — proven by a test that runs in CI with no external
  services (`npm test`), or by `tsc`/`next lint` succeeding against the actual
  source. These do not require you to do anything further.
- **REQUIRES LIVE INFRASTRUCTURE** — the code path exists and is typed,
  tested where it can be without a live dependency, and documented — but
  nobody has run it against a real Postgres/Redis/S3/LLM yet. That is your
  job before this goes live, not a claim this document makes for you.

Do not check an infrastructure item based on this document alone. Check it
after you have actually run the corresponding command against your own
environment.

---

## Infrastructure

- [ ] Postgres 15+ provisioned — REQUIRES LIVE INFRASTRUCTURE
- [ ] `pgvector` extension enabled (`drizzle/0000_pgvector_setup.sql`) — REQUIRES LIVE INFRASTRUCTURE
- [ ] Redis provisioned (BullMQ + rate limiting) — REQUIRES LIVE INFRASTRUCTURE
- [ ] S3-compatible bucket provisioned, **private**, not public-read — REQUIRES LIVE INFRASTRUCTURE
- [ ] LLM API key configured (`AI_API_KEY`) — REQUIRES LIVE INFRASTRUCTURE
- [ ] Embedding API key configured (`EMBEDDING_API_KEY`) — REQUIRES LIVE INFRASTRUCTURE
- [ ] `EMBEDDING_DIM` matches the real output dimension of `EMBEDDING_MODEL` — CODE VERIFIED
      (enforced at startup by `validateEmbeddingConfig`; a mismatch throws
      before any vector is written — see `tests/release-candidate.test.ts`)
- [ ] OCR binaries installed on the **worker** image if scanned PDFs or the
      question scanner are needed (`tesseract-ocr`, `tesseract-ocr-ben`,
      `poppler-utils`) — REQUIRES LIVE INFRASTRUCTURE

## Database

- [ ] Migrations generated and applied (`npm run db:generate && npm run db:migrate`) — REQUIRES LIVE INFRASTRUCTURE
- [ ] `drizzle/9999_search_indexes.sql` applied (HNSW + FTS + trigram indexes) — REQUIRES LIVE INFRASTRUCTURE
- [ ] Every student-owned table carries a non-null `owner_id` — CODE VERIFIED
      (`tests/isolation.test.ts` — "schema ownership invariants")
- [ ] Foreign keys use `onDelete: 'cascade'` for dependent rows, so deleting a
      textbook or user does not orphan private records — CODE VERIFIED (schema),
      REQUIRES LIVE INFRASTRUCTURE (an actual cascade delete against a live DB
      has not been run — see "Data integrity" below)

## Demo

- [ ] `npm run db:seed` executed — REQUIRES LIVE INFRASTRUCTURE
- [ ] `npm run db:seed` run a second time produces no duplicate rows — CODE
      VERIFIED by inspection (the script looks up the demo user/textbook by a
      fixed email/title before inserting, and clears+re-inserts derived rows
      rather than appending); **not yet run against a live database** to
      confirm empirically — REQUIRES LIVE INFRASTRUCTURE to fully verify
- [ ] Demo textbook embeddings present (only needed for "Ask your textbook"
      in the demo; the seed script degrades gracefully without a key) — REQUIRES LIVE INFRASTRUCTURE

## Workers

- [ ] Worker process running as a **separate, long-running process**
      (`npm run worker`), not a serverless function — REQUIRES LIVE INFRASTRUCTURE
- [ ] `WORKER_CONCURRENCY` tuned to available CPU (OCR and extraction are
      CPU-bound) — REQUIRES LIVE INFRASTRUCTURE

## Environment

- [ ] Every variable in `.env.example` set with a real value — REQUIRES LIVE INFRASTRUCTURE
- [ ] `SESSION_SECRET` is a real random value, not the placeholder — REQUIRES LIVE INFRASTRUCTURE
- [ ] `MAX_UPLOAD_BYTES` set appropriately for your host's request limits — REQUIRES LIVE INFRASTRUCTURE

## Security

- [ ] HTTPS enforced at the edge/load balancer — REQUIRES LIVE INFRASTRUCTURE
- [ ] Session cookies are `httpOnly`, `secure` in production, `sameSite: 'lax'` — CODE VERIFIED (`src/app/api/auth/login/route.ts`)
- [ ] Passwords hashed with scrypt, per-password salt, constant-time compare — CODE VERIFIED (`tests/isolation.test.ts`)
- [ ] Rate limits active on auth, ask, and generation routes — CODE VERIFIED
      (limiter logic + call sites), REQUIRES LIVE INFRASTRUCTURE (Redis must
      actually be reachable for the limiter to enforce anything — see "Known
      limitations")
- [ ] Every non-auth API route calls `requireUser`/`requireRole` — CODE VERIFIED,
      enforced by a test that walks `src/app/api` (`tests/isolation.test.ts`)
- [ ] Ownership checked before returning any resource — CODE VERIFIED (`assertOwnership`,
      identical error for missing vs. forbidden so ids cannot be enumerated)
- [ ] Uploaded textbook text sanitised before reaching an LLM prompt — CODE VERIFIED
      (`sanitiseTextbookText`, tested against real injection strings in
      `tests/release-candidate.test.ts`)
- [ ] Cross-student isolation — REQUIRES LIVE INFRASTRUCTURE to fully confirm.
      Unit tests prove every retrieval query is owner-scoped in SQL and that no
      route touches the database before authenticating; the actual "create as
      Student A, fetch as Student B, expect 403" round trip against a live
      Postgres is written in `integration/` and has **never been run** — see
      "Known limitations."

## Accessibility

- [ ] Skip-to-content link present — CODE VERIFIED
- [ ] Every `role="dialog"` has `aria-modal` and an accessible name — CODE VERIFIED (`tests/accessibility.test.ts`)
- [ ] Icon-only buttons have `aria-label` — CODE VERIFIED (`tests/accessibility.test.ts`)
- [ ] `prefers-reduced-motion` respected — CODE VERIFIED
- [ ] **Screen-reader verification requires manual testing.** No automated
      check can confirm what NVDA, JAWS, or VoiceOver actually announce for
      the reader, the quiz flow, or the streaming tutor response. This has
      **not** been done and must happen before release.
- [ ] Color contrast verified with a real contrast checker against the final
      rendered theme (dark-mode tokens are designed for AA contrast but have
      not been measured with a tool) — NOT DONE

## Observability

- [ ] Structured JSON logs shipped somewhere queryable (stdout → your log
      aggregator) — REQUIRES LIVE INFRASTRUCTURE
- [ ] Alerting on `processing.failed`, `worker.job_failed`, elevated `rag.answer` latency — REQUIRES LIVE INFRASTRUCTURE
- [ ] Backups configured for Postgres and the S3 bucket — REQUIRES LIVE INFRASTRUCTURE

## Verification commands (run these yourself; do not trust this file)

```bash
npm test              # unit tests — no infrastructure needed
npm run typecheck
npm run lint
npm run build          # requires a reachable DATABASE_URL for the build to trace API routes
npm run test:integration  # requires Postgres + Redis + S3 + API keys — see integration/README.md
```


---

## Build

- [x] `npm run build` succeeds with **no live database connection** — CODE VERIFIED,
      run directly against this repository (see command output in the release
      candidate report). Every page and API route traces cleanly; only
      `pages/_document.js` custom-font warning appears, which is a known false
      positive for the App Router (fonts are loaded correctly from the root
      layout, not `pages/`).
- [x] Known build-time warning: `bullmq`'s optional Valkey-Glide client cannot
      be resolved by webpack (`@valkey/valkey-glide` is an optional peer
      dependency BullMQ tries to bundle). This does not affect functionality —
      BullMQ falls back to its standard Redis client — but if you want a
      silent build, add `@valkey/valkey-glide` as a dependency or configure
      `serverExternalPackages: ['bullmq']` in `next.config.js`.
