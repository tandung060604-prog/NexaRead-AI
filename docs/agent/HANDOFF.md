# Current Handoff

## Current objective

Complete the NexaRead AI product upgrade through Phase 8.

## Current phase and task

`PHASE_8` / `NR-800` (`complete`)

## Completed scope

- Phase 0 baseline/checkpoint infrastructure
- Phase 1 authentication and tenant isolation
- Phase 2 Vietnamese-first localization
- Phase 3 document layout intelligence
- Phase 4 measured reading experience
- Phase 5 personal library and organization
- Phase 6 public landing experience
- Phase 7 personalization and privacy-minimized analytics
- Phase 8 testing and quality gates

The authoritative Phase 8 evidence is in
`docs/agent/PHASE_8_REPORT.md`.

## Final validation

- Backend Ruff: pass
- Backend strict mypy: pass for 119 source files
- Backend pytest: 164 passed
- Frontend ESLint: pass with zero warnings
- Frontend TypeScript: pass
- Frontend Vitest: 32 files / 144 tests passed
- Next.js production build: pass
- Release evaluation: pass
- Layout evaluation: 26/26, source fidelity 1.0
- Alembic head: `20260723_0014`
- Offline PostgreSQL upgrade/downgrade SQL: pass
- Live PostgreSQL 16 development upgrade: pass at `20260723_0014`
- Disposable PostgreSQL 16 full upgrade/downgrade/re-upgrade: pass
- Browser matrix: pass at 375x812, 768x1024, 1280x800,
  1440x900, and 1920x1080
- Compose config, checkpoint tests, task-state validation, and
  `git diff --check`: pass

## Local runtime

- Frontend: `http://127.0.0.1:3000`
- Disposable browser-quality API: `http://127.0.0.1:8000`
- The API fixture requires `BROWSER_QUALITY_PASSWORD` and binds only to
  loopback.

## Known limitations

- Do not claim production readiness until the staging browser flow, external
  security review, TLS, managed secrets, backups, and observability are
  verified.
- OCR for image-only PDFs and perfect reconstruction of complex layouts remain
  out of scope.
- Vitest prints non-fatal jsdom `HTMLMediaElement.pause()` notices.

## Exact next three steps

1. Repeat the five-viewport browser matrix in staging, including a fresh
   login/dashboard flow and screenshots.
2. Configure managed secrets, TLS, monitoring, backups, and an external
   security review before production deployment.
3. Rehearse production-like deployment and rollback with verified database and
   object-storage backups.

## Next command

`git log --oneline --decorate -5`

## Do not change

- Do not weaken authentication, session revocation, CSRF, rate limiting, or
  owner-scoped data access.
- Do not weaken source/display separation, citation anchors, retrieval
  grounding, or parser security.
- Do not add credentials or generated private data to source.

## Git state

- Publication branch: `codex/phase-8-complete`
- Use the branch history as the authoritative commit list.
