# NexaRead AI Product Upgrade — Phase 5 Report

## 1. Summary

- Phase: `PHASE_5`
- Tasks: `NR-500`, `NR-510`, `NR-520`, `NR-530`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 5 delivers the signed-in personal dashboard, owner-scoped library
organization, deterministic cached document covers, and an accessible
eight-step file/URL upload wizard. The upload flow keeps processing status
separate from reading progress, preserves original files, and gives explicit
guidance when a scanned PDF requires OCR.

## 2. Files changed

### Created

- `backend/app/api/routes/dashboard.py`
- `backend/app/api/routes/library.py`
- `backend/app/schemas/dashboard.py`
- `backend/app/schemas/library.py`
- `backend/app/services/dashboard.py`
- `backend/app/services/document_cover.py`
- `backend/app/services/library.py`
- `backend/migrations/versions/20260723_0012_library_organization.py`
- `backend/migrations/versions/20260723_0013_document_covers.py`
- `backend/tests/test_dashboard_api.py`
- `backend/tests/test_document_cover.py`
- `backend/tests/test_library_organization.py`
- `frontend/app/dashboard/page.tsx`
- `frontend/components/personal-dashboard.tsx`
- `frontend/components/personal-dashboard.test.tsx`
- `frontend/lib/dashboard-api.ts`

### Modified

- `backend/app/api/router.py`
- `backend/app/api/routes/documents.py`
- `backend/app/models/__init__.py`
- `backend/app/models/document.py`
- `backend/app/schemas/document.py`
- `backend/app/services/documents.py`
- `backend/app/services/processing.py`
- `backend/app/services/url_documents.py`
- `backend/tests/test_documents.py`
- `backend/tests/test_multi_format.py`
- `backend/tests/test_processing_ux.py`
- `frontend/app/library/page.tsx`
- `frontend/components/document-library.tsx`
- `frontend/components/document-library.test.tsx`
- `frontend/components/upload-form.tsx`
- `frontend/components/upload-form.test.tsx`
- `frontend/lib/documents-api.ts`
- `frontend/locales/en/library.json`
- `frontend/locales/en/upload.json`
- `frontend/locales/vi/library.json`
- `frontend/locales/vi/upload.json`

## 3. Database

Migration `20260723_0012` adds owner-scoped collections and tags, the
document/tag association, collection assignment, and archival state.
Migration `20260723_0013` adds cached cover metadata to document versions.
Both migrations are linear and the repository has one head at
`20260723_0013`.

Offline PostgreSQL upgrade and downgrade SQL render successfully from revision
`20260723_0011` through `20260723_0013`. Live migration execution remains
unverified because PostgreSQL/Docker Desktop is unavailable on this host.

## 4. APIs

- `GET /api/dashboard`
- `GET|POST /api/collections`
- `PATCH|DELETE /api/collections/{collection_id}`
- `GET|POST /api/tags`
- `DELETE /api/tags/{tag_id}`
- `PATCH /api/documents/{document_id}/organization`
- Expanded `GET /api/documents` search, sort, filter, archive, and pagination
  query contract
- `GET /api/documents/{document_id}/cover`
- Expanded `POST /api/documents/upload` with optional document type and
  owner-scoped collection metadata
- Expanded `POST /api/documents/import-url` with the same optional metadata

All collection, tag, cover, dashboard, upload, and library reads/writes are
scoped to the authenticated owner.

## 5. Frontend

- Personal dashboard sections for continue reading, recent documents,
  processing, collections, completed documents, bookmarks, notes, and basic
  reading statistics
- Searchable and filterable grid/list library with collections, tags, rename,
  move, archive/restore, and confirmed deletion
- Cached cover thumbnails with deterministic CSS fallback
- Eight-step upload wizard:
  1. file or public URL
  2. source information
  3. optional document type
  4. optional collection
  5. review and upload
  6. processing timeline
  7. result preview or actionable failure/OCR guidance
  8. start reading
- Drag-and-drop, keyboard-operable controls, 44px minimum action targets,
  Vietnamese/English copy, supported formats, upload size, and implemented
  account privacy behavior are visible
- No unsupported claim is made about model training or data policy

## 6. Tests added or updated

- Dashboard aggregation, nearest-heading context, processing separation, and
  owner isolation
- Library search/filter/sort, organization, archive/restore, collection
  uniqueness/deletion, and cross-account collection rejection
- Cover priority, deterministic fallback, escaping, cache endpoint,
  cross-account denial, and artifact deletion
- Upload/import document type and owner-scoped collection metadata
- Upload wizard validation, drag-and-drop, metadata submission, URL import,
  processing preview, start-reading route, API recovery, and OCR guidance
- Processing regression expectations updated for the cached cover artifact

## 7. Commands run

- `backend/.venv/Scripts/ruff.exe check app tests migrations ../evaluation/run_layout_evaluation.py`
- `backend/.venv/Scripts/mypy.exe app tests`
- `backend/.venv/Scripts/pytest.exe -q`
- `backend/.venv/Scripts/alembic.exe heads`
- Offline Alembic upgrade `20260723_0011:20260723_0013`
- Offline Alembic downgrade `20260723_0013:20260723_0011`
- `frontend/npm run lint`
- `frontend/npm run type-check`
- `frontend/npm test -- --maxWorkers=1`
- `frontend/npm run build`
- Focused backend and frontend task suites recorded in `docs/agent/TEST_LOG.md`

## 8. Results

- Backend Ruff: pass
- Backend strict mypy: 110 source files, pass
- Backend pytest: 157 tests, pass
- Alembic: one head; offline upgrade/downgrade SQL pass
- Frontend ESLint: pass without errors
- Frontend TypeScript: pass
- Frontend Vitest: 26 files / 92 tests, pass with one worker
- Next.js production build: pass; 11 routes generated

## 9. Manual verification checklist

- Open `/dashboard` and verify each section has an empty or populated state.
- Open `/library`, switch grid/list mode, combine filters, and archive/restore a
  document.
- Open `/upload`, complete all eight steps with a file and a public URL.
- During processing, leave the upload route and confirm status remains visible
  from dashboard/library.
- For `OCR_REQUIRED`, open the original and follow the text-layer re-upload
  guidance.
- At 375px width, tab through source selection, dropzone, selects, review, and
  final CTA; no horizontal page overflow should occur.

## 10. Known limitations

- The product does not perform OCR yet; scanned/image-only PDFs enter
  `OCR_REQUIRED` with concrete remediation steps.
- Live PostgreSQL migration execution is pending an available PostgreSQL
  service. Offline SQL and migration-focused tests pass.
- Vitest emits non-fatal jsdom `HTMLMediaElement.pause` notices from existing
  safe-audio tests.

## 11. Security and source integrity

- Foreign and unknown collection identifiers are rejected before storage or
  queue work begins.
- URL import retains existing SSRF protections and only accepts validated
  public HTTP(S) destinations.
- Generated covers escape untrusted metadata and are served with private cache,
  CSP, ETag, and `nosniff` headers.
- Covers and organization metadata are derived/display concerns only. Source
  text, normalization, source anchors, citations, and retrieval isolation are
  unchanged.

## 12. Out-of-scope confirmation and next readiness

No collaboration, enterprise role model, OCR engine, or architecture change
was introduced. Phase 6 can proceed with the public marketing shell and
landing page redesign while keeping authenticated application routes under the
existing app shell.
