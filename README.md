# NexaRead AI

NexaRead AI is an AI-powered reading and knowledge assistant for turning documents into searchable, source-grounded insights. Milestones 7–8 add multi-format ingestion, hardened URL import, release evaluation, security controls, observability, and deployment automation on top of grounded document chat and citations.

## Key Features

- Next.js web application with upload, library, document detail, and health pages
- Registration, password login, protected application routes, account identity, logout, and session revocation
- Vietnamese-first product localization with an English switcher and persisted account language preference
- PDF, DOCX, and EPUB validation by extension, size, MIME signature/package structure, executable rejection, and ZIP safety limits
- Document upload to S3-compatible object storage using UUID-based object keys
- List, detail, rename, and confirmed-delete document workflows
- Asynchronous PDF/DOCX/EPUB/web extraction with parser timeout, normalized blocks, visible stages, and retry-safe replacement
- Page and content-block storage with page numbers, bounding boxes, font attributes, and stable anchors
- Heuristic headings, repeated header/footer suppression, basic two-column ordering, and TOC generation
- Virtualized responsive reader with stable TOC, search, bookmark, annotation, and progress navigation
- Server-persisted reading progress and light, dark, or sepia reading preferences
- Single-block highlights in five semantic colors, bookmarks, and editable notes
- Focus Mode plus adjustable font size, line height, font family, and reading width
- Code highlighting/copy, responsive tables, KaTeX formulas with text fallback, and protected lazy images
- Versioned technical taxonomy with exact, alias, and context-aware matching
- Offset-based technical term marks with confidence, suppression, and retry-safe occurrence storage
- Keyboard-accessible term tooltips plus glossary level, category, related-term, and occurrence controls
- Per-user keyword preferences and ownership-checked keyword feedback
- Deterministic structure-aware chunks that retain their source `ContentBlock` identifiers
- PostgreSQL full-text plus pgvector retrieval, reciprocal-rank fusion, reranking, and evidence thresholds
- Single-document chat with no-answer behavior and prompt-injection guardrails
- Backend-validated citation labels with page, section, excerpt, and clickable block navigation
- Local deterministic development providers plus optional OpenAI embeddings and Responses API answers
- Chat sessions, latency/token/cost accounting, SSE event streams, and a golden RAG evaluation baseline
- FastAPI backend with liveness/readiness, request IDs, structured safe logs, AI rate limits, and document-management endpoints
- Environment-based application configuration
- PostgreSQL metadata persistence through async SQLAlchemy and Alembic migrations
- Async Redis client configuration
- Docker Compose stack with PostgreSQL, Redis, MinIO, FastAPI, and a Dramatiq worker
- Frontend and backend lint, type-check, and test commands

OCR, multi-document chat, crawling, web search, autonomous agents, and PPTX remain outside the current milestone scope.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, TanStack Virtual, Lucide, KaTeX, Highlight.js, Vitest
- Backend: FastAPI, Pydantic Settings, SQLAlchemy, Alembic, Argon2id, boto3, PyMuPDF, python-docx, EbookLib, BeautifulSoup, bleach, pytest
- Background processing: Dramatiq with Redis
- Data services: PostgreSQL, Redis, and S3-compatible object storage
- Local object storage: MinIO
- Local infrastructure: Docker Compose
- Architecture: modular monolith with a future background worker

## Repository Layout

- `docs/` - product brief, MVP requirements, and system architecture
- `frontend/` - Next.js App Router application
- `backend/` - FastAPI application, data clients, migrations, and tests
- `backend/app/tasks/` - Dramatiq actor and worker broker configuration
- `workers/` - reserved for future worker-specific deployment assets
- `evaluation/` - keyword detection dataset, benchmark runner, and generated quality report
- `scripts/` - local development and maintenance scripts

## Environment Requirements

- Node.js 20.9 or later and npm
- Python 3.11 or later
- Docker Engine with Docker Compose for the containerized workflow
- PostgreSQL 16, Redis 7, and S3-compatible storage when running services without Docker

## Environment Variables

Copy `.env.example` to `.env` before running the backend or Docker stack. When overriding frontend defaults, also copy `frontend/.env.example` to `frontend/.env.local`. The example files contain local development defaults only.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | Application environment name |
| `APP_NAME` | Backend display name |
| `SERVICE_NAME` | Backend service identifier returned by `/health` |
| `FRONTEND_URL` | Frontend URL for local integration |
| `NEXT_PUBLIC_API_URL` | API base URL used by the frontend |
| `NEXT_PUBLIC_SITE_URL` | Canonical frontend origin used for social metadata |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Frontend document size limit; keep aligned with the backend |
| `BACKEND_HOST` | Backend bind host outside Docker |
| `BACKEND_PORT` | Published backend port |
| `POSTGRES_DB` | PostgreSQL database name |
| `POSTGRES_USER` | PostgreSQL user |
| `POSTGRES_PASSWORD` | Local PostgreSQL password |
| `POSTGRES_PORT` | Published PostgreSQL port |
| `REDIS_PORT` | Published Redis port |
| `S3_PORT` | Published MinIO S3 API port |
| `S3_CONSOLE_PORT` | Published MinIO console port |
| `DATABASE_URL` | Async SQLAlchemy PostgreSQL connection URL |
| `REDIS_URL` | Redis connection URL |
| `AUTH_SESSION_HOURS` | Cookie-session lifetime in hours |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Per-IP registration/login limit; `0` disables it for tests only |
| `AUTH_COOKIE_NAME` | HttpOnly authentication cookie name |
| `AUTH_CSRF_COOKIE_NAME` | Double-submit CSRF cookie name |
| `AUTH_IP_HASH_KEY` | HMAC key for privacy-preserving session IP hashes; required in production |
| `S3_ENDPOINT` | S3-compatible endpoint used outside Docker |
| `S3_ACCESS_KEY` | Local object-storage access key |
| `S3_SECRET_KEY` | Local object-storage secret key |
| `S3_BUCKET` | Bucket for original document objects |
| `S3_REGION` | S3-compatible region |
| `MAX_UPLOAD_SIZE_MB` | Backend-enforced document upload size limit |
| `URL_IMPORT_MAX_MB` | Maximum downloaded HTML bytes for URL import |
| `URL_IMPORT_TIMEOUT_SECONDS` | End-to-end timeout per URL response |
| `URL_IMPORT_MAX_REDIRECTS` | Redirect cap with target revalidation |
| `PARSER_TIMEOUT_SECONDS` | Worker parser time budget |
| `MIN_EXTRACTED_TEXT_CHARACTERS` | Minimum extracted characters before marking a PDF `OCR_REQUIRED` |
| `RAG_PROVIDER` | `local` for deterministic offline development or `openai` for hosted generation |
| `OPENAI_API_KEY` | Required only when `RAG_PROVIDER=openai`; never commit a real value |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL override |
| `RAG_EMBEDDING_MODEL` | Embedding model used by the hosted provider |
| `RAG_EMBEDDING_DIMENSIONS` | Vector width; the Milestone 6 schema uses 384 dimensions |
| `RAG_ANSWER_MODEL` | Responses API answer model used by the hosted provider |
| `RAG_TOP_K` | Maximum hybrid-retrieval candidate count |
| `RAG_EVIDENCE_THRESHOLD` | Minimum reranked evidence score before answer generation |
| `RAG_PROVIDER_TIMEOUT_SECONDS` | Hosted provider timeout |
| `AI_RATE_LIMIT_PER_MINUTE` | Per-owner Redis rate limit for AI POST endpoints; `0` disables it |
| `RAG_RERANK_TIMEOUT_SECONDS` | Reranker timeout before the fused-order fallback |
| `RAG_INPUT_COST_PER_MILLION` | Configured input-token price used for request cost accounting |
| `RAG_OUTPUT_COST_PER_MILLION` | Configured output-token price used for request cost accounting |

The example values are development-only placeholders. Do not commit production credentials or API keys.

## Install Dependencies

Frontend:

```bash
cd frontend
# Optional when the defaults need to be overridden:
# PowerShell: Copy-Item .env.example .env.local
# macOS/Linux: cp .env.example .env.local
npm install
```

Backend:

```bash
cd backend
python -m venv .venv
# PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[dev]"
```

## Run With Docker

From the repository root:

```bash
docker compose up --build
```

The backend is available at `http://localhost:8000`, PostgreSQL at port `5432`, Redis at port `6379`, the MinIO API at port `9000`, and its console at `http://localhost:9001`. The backend applies Alembic migrations and creates the configured bucket; the worker consumes document processing jobs from Redis.

Run the frontend separately:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000/register`, create an account, upload a supported
document or import a public article URL, wait for `AI_READY`, then open
`/documents/{document_id}/read`.

## Run Services Separately

Start PostgreSQL, Redis, and MinIO:

```bash
docker compose up -d postgres redis minio
```

Run the backend from `backend/` with the virtual environment activated:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the worker in a second terminal from `backend/`:

```bash
dramatiq app.tasks.document_processing --processes 1 --threads 1
```

Run the frontend from `frontend/`:

```bash
npm run dev
```

## Quality Checks

Frontend commands, run from `frontend/`:

```bash
npm run lint
npm run type-check
npm test
npm run build
```

Backend commands, run from `backend/` with the virtual environment activated:

```bash
ruff check .
mypy app tests
pytest
```

Run the deterministic keyword benchmark from the repository root:

```bash
backend/.venv/Scripts/python evaluation/run_keyword_evaluation.py
```

Run the deterministic grounded-RAG baseline from the repository root:

```bash
backend/.venv/Scripts/python evaluation/run_rag_evaluation.py
```

Validate Docker Compose from the repository root:

```bash
docker compose config --quiet
```

## Authentication API

Authentication uses an opaque HttpOnly cookie backed by a hashed database
session. Browser mutation requests also send the CSRF cookie value in the
`X-CSRF-Token` header. Session tokens, CSRF tokens, and passwords are never
stored in plaintext.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account and issue a session |
| `POST` | `/api/auth/login` | Verify credentials and issue a session |
| `POST` | `/api/auth/logout` | Revoke the current session and clear cookies |
| `GET` | `/api/auth/me` | Read the current authenticated user |
| `PATCH` | `/api/auth/me` | Persist the authenticated user's `vi` or `en` language preference |
| `GET` | `/api/auth/sessions` | List active sessions for the current user |
| `DELETE` | `/api/auth/sessions/{session_id}` | Revoke one owned session |
| `DELETE` | `/api/auth/sessions` | Revoke every session for the current user |

The public frontend routes are `/`, `/login`, and `/register`. Library, upload,
document, reader, and account routes require a session. Password reset and
external identity providers remain outside Phase 1.

## Document API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/documents/upload` | Validate and upload one PDF, DOCX, or EPUB using multipart field `file` |
| `POST` | `/api/documents/import-url` | Safely import one public HTTP/HTTPS article URL |
| `GET` | `/api/documents?limit=50&offset=0` | List documents for the authenticated user |
| `GET` | `/api/documents/{document_id}` | Read document metadata, versions, and processing jobs |
| `PATCH` | `/api/documents/{document_id}` | Rename a document with JSON body `{ "title": "..." }` |
| `DELETE` | `/api/documents/{document_id}` | Delete object storage data and database metadata |
| `GET` | `/api/documents/{document_id}/processing-status` | Read the current stage and progress |
| `GET` | `/api/documents/{document_id}/toc` | Get PDF outline or detected headings |
| `GET` | `/api/documents/{document_id}/blocks` | Get paginated content blocks in reading order |
| `GET` | `/api/documents/{document_id}/pages/{page_number}` | Get one page and its blocks |
| `GET` | `/api/documents/{document_id}/search?q=...` | Search extracted text lexically |
| `GET` | `/api/documents/{document_id}/original` | Stream the private original PDF after ownership check |
| `GET/PUT` | `/api/documents/{document_id}/progress` | Restore or save durable reading progress |
| `GET/POST` | `/api/documents/{document_id}/bookmarks` | List or create bookmarks |
| `DELETE` | `/api/bookmarks/{bookmark_id}` | Delete an owned bookmark |
| `GET/POST` | `/api/documents/{document_id}/highlights` | List or create single-block highlights |
| `PATCH/DELETE` | `/api/highlights/{highlight_id}` | Update or delete an owned highlight |
| `POST` | `/api/highlights/{highlight_id}/note` | Attach one note to an owned highlight |
| `PATCH/DELETE` | `/api/notes/{note_id}` | Update or delete an owned note |
| `GET/PUT` | `/api/users/me/reading-preferences` | Restore or save reader preferences |
| `GET` | `/api/documents/content-blocks/{block_id}/image` | Stream a derived image after ownership check |
| `GET` | `/api/documents/{document_id}/keywords` | List filtered, offset-based technical term occurrences |
| `GET` | `/api/documents/{document_id}/keywords/{keyword_id}/occurrences` | List other visible occurrences of one term |
| `GET` | `/api/keywords/{keyword_id}` | Get level-adapted definition and related terms |
| `POST` | `/api/keyword-feedback` | Save owner-scoped feedback for one occurrence |
| `GET/PUT` | `/api/users/me/keyword-preferences` | Restore or save term visibility, level, category, and confidence |
| `POST` | `/api/documents/{document_id}/chat` | Ask one document; optionally receive SSE events |
| `GET` | `/api/documents/{document_id}/chat-sessions` | List owned sessions for one document |
| `GET/DELETE` | `/api/chat-sessions/{session_id}` | Read or delete an owned conversation |
| `POST` | `/api/documents/{document_id}/summarize` | Create a grounded document summary |
| `POST` | `/api/documents/{document_id}/explain` | Explain document evidence with validated citations |

Uploaded and imported content is untrusted. The backend sniffs supported formats independently of the browser, blocks unsafe archives/URLs, sanitizes HTML, never executes extracted content, and never uses the original filename as an object key.

## Document Processing Lifecycle

`UPLOADING` -> `SAFETY_CHECK` -> `EXTRACTING` -> `STRUCTURING` -> `READABLE` -> `TOC` -> `INDEXING` -> `COMPLETE`

At `READABLE`, source-faithful blocks and the clean display representation are
available while AI indexing continues. The document becomes `AI_READY` when
the processing job reaches `COMPLETE`. Text-poor or scanned files become
`OCR_REQUIRED`. Damaged, encrypted, or unparseable files become `FAILED` with a
safe error code. The original object remains available in both cases.
Reprocessing creates a new version from the immutable stored source so prior
versions and annotations remain stored.

The deterministic layout pipeline keeps `text`/`source_text` authoritative for
search, RAG evidence, and citations. `display_text`, transformation logs,
semantic roles, pagination hints, quality scores, and warnings are additive.
Optional AI repair is disabled by default and may return only validated
block-ID ordering/grouping metadata; failed or invalid repairs use the
deterministic output unchanged.

## Manual Test Checklist

1. Start the complete Docker stack and frontend, register two accounts, and verify login, logout, return-to routing, and session revocation.
2. Verify a signed-out request to `/library` redirects to `/login` and the public landing page has no application sidebar.
3. Upload a private fixture with Account A; verify Account B cannot list, read, download, search, annotate, or chat with it, including by guessing identifiers.
4. Open `/upload`; upload PDF/DOCX/EPUB fixtures and import one public article URL.
5. Verify upload/detail shows all eight stages from `UPLOADING` through `COMPLETE`, and that the reader opens at `READABLE` while indexing continues.
6. Verify headings, paragraphs, page separators, TOC anchors, page indicator, and lexical search.
7. Open the original PDF and verify it is served through the protected backend endpoint.
8. Refresh after navigating and verify progress resumes for that document.
9. Upload a blank/image-only PDF and verify the OCR-required message and original-PDF fallback.
10. Upload a damaged PDF and verify the safe failure state without stack trace or storage details.
11. Override the detected document type, reprocess it, and verify a new version is created while previous-version data remains intact.
12. Rename and delete the document from Library and verify Milestone 2 behavior still works.
13. Change theme, font size, spacing, width, and Focus Mode; reload and verify preferences persist.
14. Bookmark a block, select text inside one block, choose a highlight color, and add/edit/delete its note.
15. Reload the reader and verify progress, bookmarks, highlights, and notes are restored.
16. Test a generated 5,000-block fixture and verify only a bounded virtual window is mounted.
17. Open a detected technical term by mouse and keyboard; verify its tooltip and glossary definition.
18. Change reader level and category, then verify term density and explanations update after reload.
19. Navigate between term occurrences, submit feedback, and verify user highlights remain visible when ranges overlap.
20. Switch between Vietnamese and English from the header and account page; verify the root document language, dates, numbers, validation states, reader controls, and persisted preference update together.
21. Check landing, login, and register at 375x812, 768x1024, 1280x800, 1440x900, and 1920x1080 with no horizontal overflow.
22. Verify empty/populated Library, Upload, and Processing states at mobile and desktop breakpoints.
23. In book mode, verify one page is mounted on mobile and only the current two-page spread is mounted on desktop.
24. Verify TOC navigation reaches the measured page containing code, table, image, and formula blocks.
25. Verify reader pages have no nested scroll, ArrowRight changes page, mobile swipe works, and reduced motion removes the animated delay.
26. Verify mobile dialogs trap focus, Escape closes them, and focus returns to the trigger.
27. Verify light, sepia, and dark themes meet WCAG AA contrast and preserve visible focus.
28. Run the 100/1,000/5,000-block performance fixtures and the 500-document library fixture.
29. Run the Phase 8 release/layout evaluations and migration/checkpoint gates documented in `docs/agent/PHASE_8_REPORT.md`.

## Supported Imports

- PDFs with embedded, extractable text
- DOCX headings, paragraphs, lists, tables, basic code styles, and image references
- DRM-free EPUB metadata, spine-ordered chapters, headings, paragraphs, code, images, and internal links
- Public HTTP/HTTPS article pages after SSRF checks, bounded fetch, main-content extraction, and sanitization
- Single- and multi-page documents
- Common heading typography and numbered headings
- Repeated text headers/footers
- Clear, basic two-column pages
- Vietnamese Unicode when the PDF has a correct embedded font mapping

## Current Import Limits

- No OCR for scanned or image-only PDFs
- No perfect reconstruction of tables, formulas, diagrams, or complex layouts
- Ambiguous multi-column pages keep PyMuPDF's original block order
- Highlights are intentionally limited to one `ContentBlock`; cross-block selection is rejected
- Tables, formulas, and images render when structured metadata or a protected derived artifact exists
- Password login and hashed cookie sessions are implemented; password reset and external identity providers are not yet available

## Development Status

Milestones 7 and 8 are implemented and validated locally. Multi-format ingestion shares one normalized block pipeline with Reader, keywords, annotations, and RAG. The repository includes release evaluation, health/readiness, structured safe logging, Redis AI rate limiting, CI/container scanning, deployment workflows, and operations/security documentation.

This workspace has not been deployed to a real staging or production account
because no Railway/Vercel deployment credentials or environment targets are
configured. Password authentication and database-backed tenant isolation are
implemented, but production exposure still requires external security review,
TLS, managed secrets, and the controls listed in `docs/security.md`. The
complete migration chain has been validated on local PostgreSQL 16;
production-like deployment and rollback rehearsal remains required.
## Project Documentation

- [Product Brief](docs/product-brief.md)
- [MVP Requirements](docs/mvp-requirements.md)
- [System Architecture](docs/architecture.md)
- [Security Controls](docs/security.md)
- [Deployment Guide](docs/deployment.md)
- [Production Runbook](docs/runbooks/production.md)
- [Phase 1 Authentication and Isolation Report](docs/agent/PHASE_1_REPORT.md)
- [Phase 2 Localization Report](docs/agent/PHASE_2_REPORT.md)
- [Phase 3 Document Layout Intelligence Report](docs/agent/PHASE_3_REPORT.md)
- [Phase 4 Reading Experience Report](docs/agent/PHASE_4_REPORT.md)
- [Phase 8 Testing and Quality Gates Report](docs/agent/PHASE_8_REPORT.md)
