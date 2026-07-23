# NexaRead AI Product Upgrade — Phase 1 Report

## Scope and outcome

- Phase: `PHASE_1`
- Tasks: `NR-100` through `NR-140`
- Branch: `main`
- Baseline commit: `364eb0907105ccda33cff8ed5eff176024745dab`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 1 adds password authentication, hashed database sessions, CSRF
protection, login/register rate limiting, authenticated ownership resolution,
cross-account isolation coverage, protected frontend routes, and account
session management. The modular-monolith architecture, asynchronous ingestion,
source anchors, citation validation, parser security, and storage contracts
remain unchanged.

## Authentication and session contract

- Passwords are hashed with the maintained `argon2-cffi` Argon2id
  implementation.
- Opaque authentication and CSRF tokens use high-entropy values. Only SHA-256
  hashes are persisted.
- The authentication cookie is HttpOnly and SameSite=Lax. It is Secure in
  production.
- Unsafe authenticated requests require the CSRF cookie, matching
  `X-CSRF-Token` header, and the session's persisted CSRF hash.
- Login and registration use a Redis per-IP rate limit and fail closed when
  Redis is unavailable. Production configuration cannot disable this limit.
- No access token or session token is stored in browser `localStorage`.
- Stable API error codes are mapped to friendly Vietnamese frontend messages.

The API surface is:

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/sessions
DELETE /api/auth/sessions/{session_id}
DELETE /api/auth/sessions
```

## Migration notes

The new linear Alembic head is `20260723_0007`, following
`20260722_0006`.

Upgrade behavior:

1. Create `users` with unique normalized email and locale constraints.
2. For every distinct legacy owner in documents, reader annotations and
   preferences, keyword feedback/preferences, and chat sessions, insert a
   disabled legacy user.
3. Generate a deterministic internal `.invalid` email for each legacy owner;
   the disabled placeholder has no usable password.
4. Use `ON CONFLICT (id) DO NOTHING` so an owner referenced by multiple tables
   is mapped once without data loss.
5. Add ownership foreign keys to `users.id`.
6. Create `auth_sessions` with hashed token/CSRF fields and active-session
   indexes.

Downgrade removes sessions, ownership foreign keys, and users, returning the
schema to revision `20260722_0006`. Existing owner/user identifier columns are
not removed.

Upgrade and downgrade SQL both render successfully in Alembic offline mode.
The upgrade/backfill ordering and downgrade controls are covered by automated
tests. A live PostgreSQL upgrade/downgrade is still unverified on this host
because Docker Desktop/PostgreSQL is unavailable.

## Data isolation

Production request ownership no longer has a default-user fallback.
`get_current_owner_id()` resolves only from an active, unexpired,
non-revoked database session. Integration tests create two independently
authenticated accounts and cover:

- document list, detail, original download, processing state, TOC, blocks,
  pages, search, and protected images;
- reading progress, bookmarks, highlights, and notes;
- keyword data and feedback;
- chat sessions, chat access, RAG entry points, and authentication sessions.

Foreign resources are either not found or omitted from owner-filtered lists.
Search and RAG entry points cannot retrieve another user's document.

## Frontend behavior

- Public routes: `/`, `/login`, `/register`, and operational `/health`.
- Protected routes include library, upload, document detail, reader, account,
  and session management.
- Login preserves and safely validates a relative `returnTo` path.
- Forms include browser and server validation, loading state, double-submit
  protection, password visibility, and friendly Vietnamese errors.
- The authenticated application header shows an avatar initial, account name,
  account link, and logout control.
- The public landing page uses a public header and never renders the
  application sidebar.
- `/account/sessions` lists active sessions and can revoke one or all sessions.

## Validation

Passing checks:

```text
backend/.venv/Scripts/ruff.exe check .
backend/.venv/Scripts/mypy.exe app tests
backend/.venv/Scripts/pytest.exe -q
backend/.venv/Scripts/alembic.exe heads
backend/.venv/Scripts/alembic.exe upgrade 20260722_0006:20260723_0007 --sql
backend/.venv/Scripts/alembic.exe downgrade 20260723_0007:20260722_0006 --sql
npm run lint
npm run type-check
npm test -- --maxWorkers=1
npm run build
docker compose config --quiet
python scripts/test_agent_checkpoint.py
python scripts/agent_checkpoint.py validate
git diff --check
```

Final automated totals are 96 backend tests and 59 frontend tests. Frontend
lint exits successfully with 13 pre-existing warnings in reader/media
components. Vitest emits non-fatal jsdom messages for the unimplemented
`HTMLMediaElement.pause()` method.

## Remaining risks and Phase 2 boundary

- Apply upgrade and downgrade against a disposable PostgreSQL 16 database
  before production deployment; the current host cannot start Docker Desktop.
- Authentication and tenant isolation require external security review before
  production exposure.
- TLS, managed secrets, malware scanning, audit retention, restore testing,
  and production deployment remain external controls.
- Password reset and external identity providers remain backlog items.
- Phase 2 may begin with `NR-200` localization architecture after explicit
  approval; it must not weaken the authentication or owner-isolation boundary.
