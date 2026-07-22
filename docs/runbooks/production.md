# Production Operations Runbook

## Health and smoke checks

- `/health/live` confirms the API process can serve requests.
- `/health/ready` must return 200 and report database, Redis/queue, storage, and migration as healthy.
- After deployment, import one non-sensitive fixture of each supported format and verify it reaches `AI_READY`; ask one grounded question and follow its citation.

## Monitoring and alerts

Ingest JSON logs and retain `request_id`, safe user/document/job identifiers, stage, duration, status, error code, model, tokens, and cost. Never ingest document text, prompt bodies, API keys, or storage credentials.

Alert on:

- readiness failure for 2 consecutive minutes;
- API 5xx rate above 2% for 5 minutes;
- queue oldest-job age above 5 minutes or failed jobs above 5% for 10 minutes;
- parser timeout/OCR-required spikes over the rolling baseline;
- RAG provider timeout above 5%, citation validation failures, or cost-budget threshold;
- PostgreSQL/Redis/storage availability, capacity, backup, and restore-test failures.

## Incident triage

1. Use the request ID to correlate API and worker events without retrieving private text.
2. Check readiness components and queue age.
3. Pause new imports at ingress if storage/parser load is unsafe; do not disable ownership or SSRF controls.
4. If AI is degraded, switch `RAG_PROVIDER=local` only if the product owner accepts deterministic extractive behavior; retain citations/no-answer checks.
5. Record timeline, affected revisions, environment, safe identifiers, and recovery actions.

## Backup and restore

- Enable managed PostgreSQL point-in-time recovery and daily snapshots; version/retain object storage according to privacy policy.
- Redis is a queue/cache, not the system of record.
- Quarterly, restore a backup into an isolated project, run migrations, compare document/derived row counts, sample owned reads, and destroy the restore environment.

## Rollback

1. Stop the worker so it does not write data using an incompatible revision.
2. Roll API and frontend back to the recorded immutable revision.
3. Prefer forward-fixing additive migrations. Run an Alembic downgrade only after reviewing the generated SQL and confirming it will not discard required data.
4. Restart the API, require readiness, then restart the matching worker revision.
5. Run the smoke suite and monitor errors/queue age. Restore from backup only when schema/data recovery is required.
