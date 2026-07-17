# NexaRead AI

NexaRead AI is an AI-powered reading and knowledge assistant for turning documents into searchable, source-grounded insights. Milestone 5 adds versioned technical keyword detection, adaptive explanations, and reader feedback without changing source text.

## Key Features

- Next.js web application with upload, library, document detail, and health pages
- PDF validation by extension, size, non-empty content, and file signature
- Document upload to S3-compatible object storage using UUID-based object keys
- List, detail, rename, and confirmed-delete document workflows
- Asynchronous PDF extraction with visible processing stages and retry-safe output replacement
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
- FastAPI backend with health and document-management endpoints
- Environment-based application configuration
- PostgreSQL metadata persistence through async SQLAlchemy and Alembic migrations
- Async Redis client configuration
- Docker Compose stack with PostgreSQL, Redis, MinIO, FastAPI, and a Dramatiq worker
- Frontend and backend lint, type-check, and test commands

OCR, semantic retrieval, RAG, and AI features remain planned for later milestones.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, TanStack Virtual, Lucide, KaTeX, Highlight.js, Vitest
- Backend: FastAPI, Pydantic Settings, SQLAlchemy, Alembic, boto3, PyMuPDF, pytest
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
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Frontend PDF size limit; keep aligned with the backend |
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
| `DEFAULT_OWNER_ID` | Temporary local owner used before authentication is implemented |
| `S3_ENDPOINT` | S3-compatible endpoint used outside Docker |
| `S3_ACCESS_KEY` | Local object-storage access key |
| `S3_SECRET_KEY` | Local object-storage secret key |
| `S3_BUCKET` | Bucket for original document objects |
| `S3_REGION` | S3-compatible region |
| `MAX_UPLOAD_SIZE_MB` | Backend-enforced PDF upload size limit |
| `MIN_EXTRACTED_TEXT_CHARACTERS` | Minimum extracted characters before marking a PDF `OCR_REQUIRED` |

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

The backend is available at `http://localhost:8000`, PostgreSQL at port `5432`, Redis at port `6379`, the MinIO API at port `9000`, and its console at `http://localhost:9001`. The backend applies Alembic migrations and creates the configured bucket; the worker consumes PDF processing jobs from Redis.

Run the frontend separately:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`, upload a text-based PDF, wait for `READABLE`, then open `/documents/{document_id}/read`.

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
dramatiq app.tasks.document_processing --processes 1 --threads 2
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

Validate Docker Compose from the repository root:

```bash
docker compose config --quiet
```

## Document API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/documents/upload` | Validate and upload one PDF using multipart field `file` |
| `GET` | `/api/documents?limit=50&offset=0` | List documents for the current local owner |
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

Uploaded content is untrusted. The backend validates the PDF independently of the browser, never executes extracted content, never renders document HTML, and never uses the original filename as an object key.

## PDF Processing Lifecycle

`UPLOADED` -> `QUEUED` -> `EXTRACTING` -> `STRUCTURING` -> `READABLE`

Text-poor or scanned files become `OCR_REQUIRED`. Damaged, encrypted, or unparseable files become `FAILED` with a safe error code. The original object remains available in both cases. Reprocessing replaces pages and blocks for the same version in one database transaction.

## Manual Test Checklist

1. Start the complete Docker stack and frontend, then open `/upload` and upload a PDF containing embedded text.
2. Open its reader and verify the stage advances from `QUEUED` to `READABLE` without blocking the upload request.
3. Verify headings, paragraphs, page separators, TOC anchors, page indicator, and lexical search.
4. Open the original PDF and verify it is served through the protected backend endpoint.
5. Refresh after navigating and verify progress resumes for that document.
6. Upload a blank/image-only PDF and verify the OCR-required message and original-PDF fallback.
7. Upload a damaged PDF and verify the safe failure state without stack trace or storage details.
8. Reprocess the same job in tests and verify page/block counts do not increase.
9. Rename and delete the document from Library and verify Milestone 2 behavior still works.
10. Change theme, font size, spacing, width, and Focus Mode; reload and verify preferences persist.
11. Bookmark a block, select text inside one block, choose a highlight color, and add/edit/delete its note.
12. Reload the reader and verify progress, bookmarks, highlights, and notes are restored.
13. Test a generated 5,000-block fixture and verify only a bounded virtual window is mounted.
14. Open a detected technical term by mouse and keyboard; verify its tooltip and glossary definition.
15. Change reader level and category, then verify term density and explanations update after reload.
16. Navigate between term occurrences, submit feedback, and verify user highlights remain visible when ranges overlap.

## Supported PDFs

- PDFs with embedded, extractable text
- Single- and multi-page documents
- Common heading typography and numbered headings
- Repeated text headers/footers
- Clear, basic two-column pages
- Vietnamese Unicode when the PDF has a correct embedded font mapping

## Current PDF Limits

- No OCR for scanned or image-only PDFs
- No perfect reconstruction of tables, formulas, diagrams, or complex layouts
- Ambiguous multi-column pages keep PyMuPDF's original block order
- Highlights are intentionally limited to one `ContentBlock`; cross-block selection is rejected
- Tables, formulas, and images render when structured metadata or a protected derived artifact exists
- Authentication is not implemented yet; the configured local owner remains the temporary user boundary

## Development Status

Milestone 5 Keyword Intelligence is implemented for local development. The PostgreSQL taxonomy is versioned, deterministic detection runs inside the existing background worker, and occurrences, preferences, and feedback are owner-scoped. Authentication is intentionally absent, so the configured local owner remains temporary. OCR, embeddings, RAG, LLM providers, and production deployment are not implemented.

## Project Documentation

- [Product Brief](docs/product-brief.md)
- [MVP Requirements](docs/mvp-requirements.md)
- [System Architecture](docs/architecture.md)
