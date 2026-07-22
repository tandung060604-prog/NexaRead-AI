# Deployment Guide

## Environments

Use isolated development, staging, and production projects. Never share databases, Redis, object buckets, API keys, or owner identifiers across environments. Staging deploys automatically from `main`; production is a manual workflow dispatch protected by the GitHub `production` environment approval rule.

## Services

- Frontend: Vercel project rooted at `frontend/`.
- API: Railway service using `deploy/railway/backend.toml`.
- Worker: separate Railway service using `deploy/railway/worker.toml` and the same immutable source revision as the API.
- Managed PostgreSQL 16 with pgvector, managed Redis, and private S3-compatible object storage.

The API owns migrations. Deploy the API, wait for `/health/ready`, then roll the worker and frontend. Do not run competing migrations from workers.

## Required configuration

Set every variable documented in `.env.example`. Production additionally requires strong managed credentials, `APP_ENV=production`, a verified `FRONTEND_URL`, a real identity integration before public access, `RAG_PROVIDER=openai` when hosted AI is desired, and secret-managed `OPENAI_API_KEY`. Configure `URL_IMPORT_*`, `PARSER_TIMEOUT_SECONDS`, and `AI_RATE_LIMIT_PER_MINUTE` according to capacity.

GitHub environments require:

- Secrets: `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and the relevant Vercel project ID.
- Variables: `STAGING_API_URL` and `PRODUCTION_API_URL`.
- A required reviewer on the `production` environment.

## Release gate

CI must pass backend lint/type/tests, frontend lint/type/tests/build, migration dry-run, backend image build and high/critical container scan, and `evaluation/run_release_evaluation.py`. Store the release report artifact with the commit SHA. Product/adoption metrics remain unavailable until staging telemetry is connected and must not be invented.

## Deployment sequence

1. Back up PostgreSQL metadata and record current API/worker/frontend revisions.
2. Run CI and review the release report and migration SQL artifact.
3. Deploy API to staging; its start command runs `alembic upgrade head`.
4. Confirm `/health/live` and `/health/ready`, then deploy the worker and frontend.
5. Smoke test PDF, DOCX, EPUB, URL import, Reader, keyword detection, grounded chat/citations, rename, and deletion.
6. For production, approve the protected workflow, repeat health/smoke checks, and watch alerts through the observation window.

This repository provides deployable configuration but has no configured cloud credentials in the workspace; a local green build is not proof that staging or production was deployed.
