# NexaRead AI Product Upgrade — Phase 0 Baseline Report

## Baseline identity

- Task: `NR-000`
- Phase: `PHASE_0`
- Branch: `main`
- Baseline commit: `364eb0907105ccda33cff8ed5eff176024745dab`
- Audit date: `2026-07-23` (`+07:00`)
- Scope: discovery, checkpoint infrastructure, and baseline validation only
- Product behavior changed in Phase 0: none

The working tree already contained an unstaged change to
`frontend/next-env.d.ts` when this audit resumed. Phase 0 does not claim or
revert that change.

## Current architecture

NexaRead remains the modular monolith described by `docs/architecture.md`:

- A Next.js App Router frontend provides the public home, document library,
  upload, document detail, reader, and health pages.
- A FastAPI backend separates API routes, schemas, SQLAlchemy models, service
  logic, parsing, retrieval, storage, Redis, and observability.
- A Dramatiq worker in `backend/app/tasks/` performs asynchronous document
  processing.
- PostgreSQL stores metadata and pgvector embeddings; Redis supports the queue
  and rate limiting; S3-compatible storage holds original and derived files.
- PDF, DOCX, EPUB, and URL adapters normalize content into shared page and
  `ContentBlock` records.
- Keyword intelligence and RAG reuse stable block identifiers and source
  anchors.
- Evaluation fixtures and runners live under `evaluation/`.
- Docker Compose supplies PostgreSQL, Redis, MinIO, the API, and the worker.
- CI, deployment descriptors, security documentation, and a production runbook
  exist, but no real staging or production deployment was verified in Phase 0.

### Frontend routes

| Route | Source |
| --- | --- |
| `/` | `frontend/app/page.tsx` |
| `/library` | `frontend/app/library/page.tsx` |
| `/upload` | `frontend/app/upload/page.tsx` |
| `/health` | `frontend/app/health/page.tsx` |
| `/documents/[documentId]` | `frontend/app/documents/[documentId]/page.tsx` |
| `/documents/[documentId]/read` | `frontend/app/documents/[documentId]/read/page.tsx` |

The production build also emits the framework `_not-found` route. There are no
login, registration, account, or session-management routes.

### Backend routes

The OpenAPI schema exposes:

```text
GET                 /health
GET                 /health/live
GET                 /health/ready
POST                /api/documents/upload
POST                /api/documents/import-url
GET                 /api/documents
GET/PATCH/DELETE    /api/documents/{document_id}
GET                 /api/documents/{document_id}/processing-status
GET                 /api/documents/{document_id}/toc
GET                 /api/documents/{document_id}/blocks
GET                 /api/documents/{document_id}/pages/{page_number}
GET                 /api/documents/{document_id}/search
GET                 /api/documents/{document_id}/original
GET                 /api/documents/content-blocks/{block_id}/image
GET/PUT             /api/documents/{document_id}/progress
GET/POST            /api/documents/{document_id}/bookmarks
DELETE              /api/bookmarks/{bookmark_id}
GET/POST            /api/documents/{document_id}/highlights
PATCH/DELETE        /api/highlights/{highlight_id}
POST                /api/highlights/{highlight_id}/note
PATCH/DELETE        /api/notes/{note_id}
GET/PUT             /api/users/me/reading-preferences
GET                 /api/documents/{document_id}/keywords
GET                 /api/documents/{document_id}/keywords/{keyword_id}/occurrences
GET                 /api/keywords/{keyword_id}
POST                /api/keyword-feedback
GET/PUT             /api/users/me/keyword-preferences
POST                /api/documents/{document_id}/chat
POST                /api/documents/{document_id}/summarize
POST                /api/documents/{document_id}/explain
GET                 /api/documents/{document_id}/chat-sessions
GET/DELETE          /api/chat-sessions/{session_id}
```

There are no authentication APIs.

### Models and migrations

The 18 SQLAlchemy tables are:

```text
documents
document_versions
processing_jobs
pages
content_blocks
reading_progress
bookmarks
highlights
notes
user_reading_preferences
keywords
keyword_occurrences
keyword_feedback
user_keyword_preferences
chunks
chat_sessions
chat_messages
citations
```

Six linear Alembic revisions are present:

```text
20260716_0001
→ 20260716_0002
→ 20260717_0003
→ 20260717_0004
→ 20260717_0005
→ 20260722_0006 (head)
```

`alembic heads` confirms a single head. `alembic current` could not inspect the
applied database revision because local PostgreSQL was not running.

## Existing functionality to preserve

- Validated PDF, DOCX, and EPUB upload plus hardened public URL import.
- Asynchronous extraction, structuring, keyword detection, chunking, embedding,
  indexing, and status reporting.
- S3-compatible original/derived object storage with random object keys.
- Page and content-block storage with stable source anchors.
- TOC, lexical search, original-file fallback, and processing failure states.
- Virtualized scroll reader, reading progress, preferences, focus mode,
  bookmarks, single-block highlights, and notes.
- Book presentation mode, page-turn controls, reduced-motion handling, reading
  rooms, and opt-in ambient/page-turn audio.
- Versioned technical taxonomy, offset-based occurrences, glossary,
  preferences, and feedback.
- Structure-aware chunks, hybrid retrieval, evidence thresholds, grounded
  single-document chat, no-answer behavior, and backend-validated citations.
- Upload, URL, parser, prompt-injection, rate-limit, health/readiness,
  evaluation, CI, and deployment safeguards implemented by Milestones 4–8.

Source anchors, source-grounded retrieval, citation validation, and existing
file security controls are non-regression constraints for every later phase.

## Authentication and data-isolation gap

The backend already passes an owner/user identifier through document,
annotation, keyword, reader, storage, chat, and retrieval services. Those
queries generally filter by that identifier. This is useful groundwork, but it
is not real account isolation:

- `get_current_owner_id()` returns configured `default_owner_id`.
- The default is `local-user`; all production requests would share it.
- There is no `users` table, `auth_sessions` table, password hash, session token,
  authenticated cookie, CSRF boundary, registration/login rate limit, or
  session revocation flow.
- There are no auth APIs or protected frontend routes.
- CORS currently has `allow_credentials=False`, consistent with the unauthenticated
  baseline but incompatible with a future cross-origin cookie session unless
  deliberately revised.
- Ownership columns use `String(128)` and mix `owner_id` and `user_id` names.
- Existing tests exercise ownership filters with synthetic IDs, but not
  authenticated cross-account HTTP sessions.

Until Phase 1 is implemented and tested, the application must not be exposed as
a multi-user production service.

## Localization gap

- `<html lang="en">` and English metadata are hardcoded.
- Navigation and most user-facing content are hardcoded in English.
- Date formatting uses `Intl.DateTimeFormat("en", ...)`.
- No domain dictionaries, locale provider, language selector, persisted locale,
  `vi-VN` number/date formatting, or `Asia/Ho_Chi_Minh` presentation default
  exists.
- Two reader failure messages are Vietnamese, but this is ad hoc rather than a
  localization architecture.

The Phase 2 requirement for Vietnamese-first `vi`/`en` localization is
therefore not met.

## Reader pagination gap

Book presentation exists, but it does not meet the measured-pagination
contract:

- `paginateBlocks()` estimates block height from block type and character count.
- Page capacity is a fixed approximate `650` pixels.
- Pagination is memoized only from `blocks`; font, line height, reading width,
  viewport, image load, and font load do not trigger measured reflow.
- Oversized paragraphs are not split across reading pages.
- `BookPage` uses `overflow-y-auto`, creating an internal page scrollbar, which
  is explicitly forbidden by the upgrade brief.
- Page containers mix `minHeight: 70vh` and `maxHeight: 85vh`, so rendered
  capacity is not the same value used by the paginator.
- Source page numbers and reflow page numbers are not consistently separated in
  labels and progress.

Scroll mode remains virtualized and should be preserved while book mode is
replaced with DOM-measured pagination in Phase 4.

## UX gap

- The public home page is rendered inside the application sidebar.
- The landing page is an English hero plus three feature cards; it lacks the
  required public header, problem, workflow, user, privacy, FAQ, real product
  preview, and final CTA sections.
- The sidebar exposes a developer health page to ordinary users.
- Library is a basic list with upload CTA; it lacks personal dashboard sections,
  collections, tags, richer filters/sorts, grid/list controls, and reading
  summaries.
- Upload is a single form, not the required guided wizard.
- Reader desktop renders chat, search, glossary, annotations, and typography in
  one long right sidebar instead of a focused tabbed information architecture.
- There is no account identity, avatar, logout, onboarding, or account
  preferences flow.
- The current UI is desktop-oriented and English-first; browser-level viewport
  and WCAG 2.1 AA coverage required by the upgrade is not present.

## Test and validation baseline

### Checkpoint infrastructure

- `python scripts/test_agent_checkpoint.py`: **PASS**, 3 tests.
- `backend/.venv/Scripts/ruff.exe check scripts/agent_checkpoint.py scripts/test_agent_checkpoint.py`:
  **PASS**, 2 files.
- `python scripts/agent_checkpoint.py validate`: **PASS**.

The validator initially failed on this Windows checkout because CP1252 could not
encode the Vietnamese repository path. It now prints the repository-relative
state path, with a non-ASCII path regression test.

### Frontend

- `npm run lint`: **PASS**, 0 errors and 13 warnings.
- `npm run type-check`: **PASS**, no diagnostics.
- `npm test`: **FAIL** in the default parallel worker mode; only 1 test completed
  and 9 worker forks exited unexpectedly.
- `npm test -- --maxWorkers=1`: **PASS**, 10 files and 48 tests.
- `npm run build`: **PASS**, 7 generated routes.

The 13 lint warnings are pre-existing and include unused imports/variables,
React hook dependency warnings, an unused disable directive, and an unoptimized
image. The Vitest parallel failure appears host-resource related because the
same suite passes with one worker; this remains a baseline environment risk,
not a product pass in default mode.

Frontend test files cover the home page, upload, library, reader,
reader performance, reader blocks/tools, reading rooms, keyword glossary, and
document chat.

### Backend

- `.venv/Scripts/ruff.exe check .`: **PASS**.
- `.venv/Scripts/mypy.exe app tests`: **PASS**, 74 source files.
- `.venv/Scripts/pytest.exe`: **PASS**, 83 tests in 23.08 seconds.
- `.venv/Scripts/alembic.exe heads`: **PASS**, one head
  (`20260722_0006`).
- `.venv/Scripts/alembic.exe current`: **FAIL**, PostgreSQL connection refused.

Fifteen backend test modules cover documents, PDF and multi-format parsing,
reader, annotations, keyword detection/API, RAG chunking/retrieval/providers/API
and evaluation, health/lifespan, and rate limiting.

### Infrastructure

- `docker compose config --quiet`: **PASS**.
- No live Compose stack, applied migration, end-to-end upload/worker/RAG smoke
  flow, staging deployment, or production deployment was verified in Phase 0.

## Migration risks for Phase 1

1. Existing documents are owned by a configured string such as `local-user`;
   auth migrations need an explicit legacy-user mapping before foreign keys are
   enforced.
2. Ownership is duplicated across documents, annotations, preferences,
   feedback, and chat. Backfill order and constraints must preserve every
   record.
3. Converting string owner identifiers to UUID user foreign keys in one
   destructive step would be risky. Prefer additive columns/backfill/validate/
   constrain sequencing or retain compatible identifiers deliberately.
4. Retrieval and original-file checks depend on the same owner boundary;
   partial migration could leak or hide chunks and stored objects.
5. The applied local revision is unknown until PostgreSQL is available.
   Migration upgrade tests must start from the current six-revision schema.
6. Downgrades exist in current migrations, but Phase 1 must document whether
   session/user data downgrade is supported or requires a forward fix.

## Phase implementation plan

1. **Phase 0 — Baseline and discovery:** checkpoint tooling, audit, validation,
   this report, final handoff.
2. **Phase 1 — Authentication and isolation:** users/sessions, secure cookie and
   CSRF boundary, auth APIs/UI, legacy owner migration, backend-enforced
   cross-account integration tests.
3. **Phase 2 — Vietnamese-first localization:** structured `vi`/`en`
   dictionaries, formatting, locale persistence, translated product UI and
   stable backend error codes.
4. **Phase 3 — Document layout intelligence:** repository skill, immutable
   source/display text contract, transformation log/confidence, parser
   reconstruction rules, idempotent reprocessing and citation evaluations.
5. **Phase 4 — Reader rebuild:** DOM-measured pagination, no nested page scroll,
   responsive one/two-page reflow, source/reading page distinction, focused
   panels, accessibility, and preference persistence.
6. **Phase 5 — Personal library and upload:** dashboard, organization,
   deterministic cover/thumbnail pipeline, and guided upload wizard.
7. **Phase 6 — Public landing:** separate marketing shell, Vietnamese product
   narrative, real product preview, privacy claims backed by implemented
   controls, FAQ, responsive design.
8. **Phase 7 — Personalization:** optional onboarding, document-type defaults,
   and privacy-minimized reading analytics.
9. **Phase 8 — Quality gates:** auth/isolation, normalization, pagination,
   browser viewport, accessibility, performance, migration, and citation/RAG
   regression suites.

Phase 1 should begin only as a separately scoped task after this Phase 0 state
is reviewed. No Phase 1 files are proposed or modified by this report.
