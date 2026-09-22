# AI StudyOS — Route Inventory

Status legend:
- **READY** — code complete, unit-tested where the logic is pure, and (for
  pages) wired to real API routes with no client-side fabrication.
- **READY — untested live** — code complete and typed, but its correctness
  against a real database/AI provider has not been observed, only reasoned
  about and covered by unit tests of its pure parts.
- **NOT BUILT** — no page/route exists yet.

Nothing here is marked READY on the strength of "it should work" — it is
marked READY when a test or a successful build actually exercised it.

## Pages

| Route | Auth | Role | Backend dependency | Status |
|---|---|---|---|---|
| `/` | Public | any | session cookie only | READY |
| `/login` | Public | any | Postgres (users) | READY — untested live |
| `/signup` | Public | any | Postgres (users) | READY — untested live |
| `/dashboard` | Required | student | textbooks, coach, analytics APIs | READY — untested live |
| `/textbooks` | Required | student | S3, BullMQ, Postgres | READY — untested live |
| `/textbooks/[id]` | Required, ownership-checked | student | pgvector, LLM, SSE | READY — untested live |
| `/tutor` | Required | student | textbooks API | READY — untested live |
| `/flashcards` | Required | student | flashcards, revision (SM-2) | READY — untested live |
| `/revision` | Required | student | revision (SM-2) | READY — untested live |
| `/quizzes` | Required | student | quiz generate/answer/finish | READY — untested live |
| `/mistakes` | Required | student | mistakes, mastery | READY — untested live |
| `/planner` | Required | student | planner engine | READY — untested live |
| `/analytics` | Required | student | analytics aggregation | READY — untested live |
| `/knowledge` | Required, ownership-checked | student | knowledge graph builder | READY — untested live |
| `/focus` | Required | student | study_sessions | READY — untested live |
| `/notes` | Required | student | notes CRUD + generation | READY — untested live |
| `/scanner` | Required | student | image OCR, retrieval, LLM | READY — untested live (requires `OCR_PROVIDER` configured) |
| `/projects` | Required | student | projects CRUD | READY — untested live |
| `/skills` | Required | student | skill_events | READY — untested live (requires seeded skill_categories) |
| `/career` | Required | student | career_paths (curated data) | READY — untested live (empty until data is seeded) |
| `/achievements` | Required | student | evaluated from real event tables | READY — untested live |
| `/settings` | Required | any | session only | READY (intentionally minimal) |
| `/teacher` | Required | teacher only | teacher_classes, privacy projection | READY — untested live |
| `/parent` | Required | parent only | student_parent_links, privacy projection | READY — untested live |
| `/admin` | Required | admin only | system counts, no student content | READY — untested live |
| `/demo` | Required (any signed-in user) | any | full stack — no scripted fallback | READY — untested live, **and will show a real error state, not fake success, if infra is missing** |

## API routes (32 total, 41 including nested dynamic segments)

| Route | Auth | Ownership check | Status |
|---|---|---|---|
| `POST /api/auth/signup` | Entry point | n/a | READY — untested live |
| `POST /api/auth/login` | Entry point | n/a | READY — untested live |
| `POST /api/auth/logout` | Entry point (self-clears invalid sessions) | n/a | READY — untested live |
| `GET /api/textbooks` | Required | filters by owner in query | READY — untested live |
| `POST /api/textbooks/upload-url` | Required | creates own resource | READY — untested live |
| `POST /api/textbooks/[id]/enqueue` | Required | `assertOwnership` on textbook + job | READY — untested live |
| `GET /api/textbooks/[id]/status` | Required | `assertOwnership` | READY — untested live |
| `GET /api/textbooks/[id]/chapters` | Required | `assertOwnership` | READY — untested live |
| `GET /api/textbooks/[id]/pages/[pageNumber]` | Required | `assertOwnership` | READY — untested live |
| `DELETE /api/textbooks/[id]` | Required | `assertOwnership`, cascades in schema | READY — untested live |
| `POST /api/ask` | Required | ownership on textbookId if given | READY — untested live |
| `POST /api/ask/stream` | Required | ownership on textbookId if given | READY — untested live |
| `GET /api/mastery` | Required | `assertOwnership` on textbook | READY — untested live |
| `GET /api/coach/today` | Required | filters by owner in query | READY — untested live |
| `GET/POST /api/flashcards` | Required | `assertOwnership` on chapter | READY — untested live |
| `POST /api/flashcards/[id]/review` | Required | `assertOwnership` on card | READY — untested live |
| `POST /api/quiz/generate` | Required | `assertOwnership` on chapter | READY — untested live |
| `POST /api/quiz/[attemptId]/answer` | Required | `assertOwnership` on attempt + question | READY — untested live |
| `POST /api/quiz/[attemptId]/finish` | Required | `assertOwnership` | READY — untested live |
| `GET /api/mistakes` | Required | filters by owner in query | READY — untested live |
| `GET /api/mistakes/practice` | Required | filters by owner in query | READY — untested live |
| `GET /api/planner` | Required | filters by owner in query | READY — untested live |
| `POST /api/planner/generate` | Required | filters by owner in query | READY — untested live |
| `PATCH /api/planner/[itemId]` | Required | `assertOwnership` | READY — untested live |
| `GET /api/analytics` | Required | filters by owner in query | READY — untested live |
| `GET /api/knowledge/[textbookId]` | Required | `assertOwnership` | READY — untested live |
| `POST /api/focus/start` | Required | creates own resource | READY — untested live |
| `POST /api/focus/finish` | Required | `assertOwnership`, server computes duration | READY — untested live |
| `GET/POST /api/notes` | Required | `assertOwnership` on chapter if given | READY — untested live |
| `PATCH/DELETE /api/notes/[id]` | Required | `assertOwnership` | READY — untested live |
| `POST /api/notes/generate` | Required | `assertOwnership` on chapter | READY — untested live |
| `GET /api/achievements` | Required | filters by owner, idempotent unlock | READY — untested live |
| `GET /api/skills` | Required | filters by owner in query | READY — untested live |
| `GET /api/career` | Required (read-only, not owner-scoped — shared reference data) | n/a | READY — untested live |
| `GET/POST /api/projects` | Required | filters by owner / creates own | READY — untested live |
| `PATCH/DELETE /api/projects/[id]` | Required | `assertOwnership` | READY — untested live |
| `POST /api/scanner` | Required | `assertOwnership` on textbookId if given | READY — untested live (requires `OCR_PROVIDER`) |
| `GET/POST /api/teacher/classes` | `requireRole('teacher')` | teacher-owned class | READY — untested live |
| `GET /api/teacher/classes/[id]` | `requireRole('teacher')` | class ownership + cohort-size suppression | READY — untested live |
| `GET /api/parent/students` | `requireRole('parent')` | linked students only | READY — untested live |
| `GET /api/admin/overview` | `requireRole('admin')` | n/a (system-level only) | READY — untested live |

**Automated cross-check:** `tests/isolation.test.ts` walks every file in
`src/app/api` and asserts it calls `requireUser` or `requireRole`, except the
three declared auth entry points. This means the table above cannot silently
drift from reality — a new route without an auth call fails the test suite,
not just this document.

## Not built

- Route for viewing a single project's detail (tasks/resources sub-view) —
  only the list/create/advance/delete surface exists
- `/career` has no admin authoring UI — `career_paths` rows must be inserted
  directly until an admin CRUD page is built
- No route serves the question-scanner's stored history
  (`scanned_questions` rows are written but never read back)
