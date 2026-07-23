# NexaRead AI Product Upgrade — Phase 7 Report

## 1. Summary

- Phase: `PHASE_7`
- Tasks: `NR-700`, `NR-710`, `NR-720`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 7 adds optional three-step onboarding, document-type-aware reader
defaults, and privacy-first aggregate reading analytics. Onboarding never
gates the dashboard or library. Automatic reader defaults are applied only at
display time and do not become account overrides until the user deliberately
changes a reader setting.

## 2. Files changed

### Created

- `backend/app/api/routes/personalization.py`
- `backend/app/schemas/personalization.py`
- `backend/app/services/personalization.py`
- `backend/migrations/versions/20260723_0014_personalization.py`
- `backend/tests/test_personalization_api.py`
- `frontend/app/onboarding/page.tsx`
- `frontend/components/onboarding-wizard.tsx`
- `frontend/components/onboarding-wizard.test.tsx`
- `frontend/components/research-reference-panel.tsx`
- `frontend/components/research-reference-panel.test.tsx`
- `frontend/lib/personalization-api.ts`
- `frontend/lib/reader-personalization.ts`
- `frontend/lib/reader-personalization.test.ts`
- `frontend/locales/en/personalization.json`
- `frontend/locales/vi/personalization.json`
- `docs/agent/PHASE_7_REPORT.md`

### Modified

- `backend/app/api/router.py`
- `backend/app/models/__init__.py`
- `backend/app/models/annotation.py`
- `backend/app/models/auth.py`
- `backend/app/schemas/annotation.py`
- `backend/app/schemas/dashboard.py`
- `backend/app/services/annotations.py`
- `backend/app/services/dashboard.py`
- `backend/tests/test_dashboard_api.py`
- `frontend/components/auth-form.tsx`
- `frontend/components/auth-form.test.tsx`
- `frontend/components/document-reader.tsx`
- `frontend/components/document-reader.test.tsx`
- `frontend/components/personal-dashboard.tsx`
- `frontend/components/personal-dashboard.test.tsx`
- `frontend/lib/dashboard-api.ts`
- `frontend/lib/documents-api.ts`
- `frontend/lib/i18n.ts`
- `frontend/lib/i18n.test.ts`
- `frontend/locales/en/reader.json`
- `frontend/locales/vi/reader.json`

## 3. Optional onboarding

Registration now opens `/onboarding`, where a user can complete no more than
three steps:

1. usual reading types, including Study, Research, Work, Books, and Technical
   documents;
2. primary reading goal;
3. preferred display style and an optional analytics opt-in.

The user can skip from the first screen without answering. Existing completed
or skipped profiles return to the dashboard, and no middleware or route guard
requires onboarding completion.

## 4. Document-type reader defaults

- Books and textbooks: sepia theme, serif typography, book mode, and chapter
  navigation.
- Research papers and theses: clean layout, section navigation, and a dedicated
  abstract/reference panel with stable block navigation.
- Technical documents: sans-serif typography, code-friendly width, and the
  terminology panel selected by default.
- Vietnamese legal documents: clean layout and explicit Điều/Khoản navigation
  labels while preserving the parser's existing stable headings and numbering.

These are display defaults only. Source text, semantic layout records, source
anchors, and citation targets are not modified. A saved per-document progress
mode wins over an automatic mode, and any deliberate reader control change is
persisted with `use_document_type_defaults=false`.

## 5. Privacy-first analytics

Analytics is disabled by default and can be enabled during onboarding or from
the dashboard. The backend stores only:

- aggregate reading seconds by user and date;
- progress already required for resume reading;
- derived streak, documents started/completed, and source pages reached.

No raw click, scroll, pointer, selection, or detailed behavior event stream is
stored. Reading-time increments are server-derived from progress-save
intervals, ignore intervals under five seconds, and cap one interval at five
minutes. Disabling analytics deletes daily aggregates and resets accumulated
reading seconds.

The dashboard presents aggregate time, streak, source pages, and completed
documents without goals, pressure, scarcity, or dark-pattern prompts. The
disable action explicitly states that saved statistics will be deleted.

## 6. Database and APIs

Migration `20260723_0014` adds:

- `user_personalization`;
- `reading_daily_summaries`;
- `reading_progress.reading_seconds`;
- `user_reading_preferences.use_document_type_defaults`;
- `user_reading_preferences.analytics_enabled`.

The repository has one Alembic head at `20260723_0014`. Offline PostgreSQL
upgrade and downgrade SQL render successfully between revisions `0013` and
`0014`.

New endpoints:

- `GET|PUT /api/users/me/onboarding`
- `POST /api/users/me/onboarding/skip`
- `GET /api/users/me/reading-analytics`
- `PUT /api/users/me/reading-analytics/preference`

All data is scoped to the authenticated owner.

## 7. Tests and validation

Backend coverage includes:

- optional onboarding, skip, persistence, validation, and owner isolation;
- analytics opt-in, aggregate creation, streak derivation, completion/pages,
  disable-and-delete behavior, and privacy defaults;
- preference and dashboard regression coverage.

Frontend coverage includes:

- registration redirect and three onboarding steps;
- skip behavior and non-gating completed/skipped profiles;
- book, research, technical, and legal reader defaults;
- explicit account override precedence;
- no automatic persistence of display-time defaults;
- research abstract, section, and reference navigation;
- aggregate analytics enable flow and visible privacy controls.

Commands:

- `backend/.venv/Scripts/ruff.exe check app tests migrations ../evaluation/run_layout_evaluation.py`
- `backend/.venv/Scripts/mypy.exe app tests`
- `backend/.venv/Scripts/pytest.exe -q`
- `backend/.venv/Scripts/alembic.exe heads`
- Offline Alembic upgrade `20260723_0013:20260723_0014`
- Offline Alembic downgrade `20260723_0014:20260723_0013`
- `frontend/npm run lint`
- `frontend/npm run type-check`
- `frontend/npm test -- --maxWorkers=1`
- `frontend/npm run build`

Results:

- Backend Ruff: pass
- Backend strict mypy: 114 source files, pass
- Backend pytest: 161 tests, pass
- Alembic: one head; offline upgrade/downgrade SQL pass
- Frontend ESLint: pass
- Frontend TypeScript: pass
- Frontend Vitest: 29 files / 110 tests, pass with one worker
- Next.js production build: pass; 12 routes generated

## 8. Manual verification checklist

- Register and confirm the optional onboarding route opens.
- Skip immediately and confirm dashboard/library remain available.
- Complete each onboarding choice in Vietnamese and English.
- Open book, research, technical, and legal documents with automatic defaults,
  then change a setting and confirm the user override survives reload.
- For a research paper, navigate from abstract, section, and reference entries.
- Enable analytics, read long enough to create more than one progress save,
  and verify only aggregate dashboard values appear.
- Disable analytics and confirm values reset without affecting reading
  position, bookmarks, notes, or documents.

## 9. Known limitations

- Live PostgreSQL migration execution remains unverified because no local
  PostgreSQL/Docker Desktop service is available. Offline PostgreSQL SQL,
  migration ordering, models, and API behavior are verified.
- Vitest prints non-fatal jsdom `HTMLMediaElement.pause` notices from existing
  safe-audio tests.
- Browser-level viewport, keyboard, accessibility, and performance validation
  are Phase 8 quality gates.
