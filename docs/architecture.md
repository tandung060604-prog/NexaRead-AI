# Architecture

## System Overview

NexaRead AI starts as a modular monolith with a background worker. This keeps the MVP simple enough for a small team while still separating the core responsibilities clearly.

The system is organized into four main layers:

- Frontend: document library, upload flow, reader, and question interface
- Backend: API, auth boundary, document metadata, chat orchestration
- Workers: document parsing, chunking, embedding, indexing, and enrichment
- Evaluation: retrieval and grounded-answer quality checks

## MVP Technology Stack

| Component | Technology |
| --- | --- |
| Frontend | Next.js + TypeScript |
| UI | Tailwind CSS |
| Backend | FastAPI |
| Database | PostgreSQL |
| Vector search | pgvector |
| Queue/cache | Redis |
| Worker | Dramatiq or Celery |
| File storage | Cloudflare R2 or S3 |
| PDF | PyMuPDF + PDF.js |
| DOCX | python-docx |
| EPUB | EbookLib + EPUB.js |
| Frontend deployment | Vercel |
| Backend deployment | Railway or Cloud Run |

## Initial Services

- PostgreSQL stores users, documents, chunks, conversations, and job metadata.
- pgvector stores and searches document chunk embeddings inside PostgreSQL.
- Redis supports background jobs and short-lived coordination.
- Object storage stores original document files and derived artifacts.
- AI provider APIs generate embeddings and answer drafts.

## Data Flow

1. User uploads a document through the frontend.
2. Backend stores metadata and creates an ingestion job.
3. Worker extracts text, chunks content, generates embeddings, and updates status.
4. User asks a question through the backend.
5. Backend retrieves relevant chunks, calls the answer model, and returns citations.

## Early Architecture Decisions

- Use a modular monolith for the MVP instead of microservices.
- Add a separate background worker for ingestion and indexing jobs.
- Keep ingestion asynchronous so large documents do not block API requests.
- Keep evaluation fixtures close to the repository so quality changes are reviewable.
- Treat citations as part of the answer contract, not an optional display detail.
