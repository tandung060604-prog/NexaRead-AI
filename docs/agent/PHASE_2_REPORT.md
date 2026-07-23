# NexaRead AI Product Upgrade — Phase 2 Report

## Scope and outcome

- Phase: `PHASE_2`
- Tasks: `NR-200` and `NR-210`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 2 establishes a product-wide localization layer with Vietnamese as the
default language and English as the supported alternative. It localizes the
public site, authentication, account and session management, library, upload,
document detail, reader, annotations, glossary, document chat, reading rooms,
and audio controls without changing the modular-monolith architecture,
ownership boundary, source anchors, or citation contract.

## Localization contract

- Product strings are organized by domain under `frontend/locales/{vi,en}`:
  `common`, `auth`, `errors`, `library`, `upload`, `reader`, `chat`, and
  `landing`.
- `I18nProvider` supplies locale-aware translation, date, and number helpers.
- Vietnamese (`vi-VN`) is the default; English uses `en-US`.
- Product dates use the `Asia/Ho_Chi_Minh` time zone.
- Missing English messages fall back to Vietnamese, then to the explicit
  `domain.key` marker so missing content is detectable.
- Vietnamese and English dictionaries have identical key topology, enforced
  by an automated test.
- The active locale updates the root HTML `lang` attribute for assistive
  technology.

## Account preference

Authenticated users can change language from the application header or account
page. `PATCH /api/auth/me` accepts only `vi` or `en`, requires the existing CSRF
protection, persists `users.preferred_locale`, and returns the updated user.
Anonymous visitors default to Vietnamese and can switch language for the
current browser session.

## Product-wide Vietnamese coverage

The default Vietnamese experience now covers:

- public landing content and calls to action;
- login, registration, account, logout, and session revocation;
- library empty/loading/error states, document statuses, rename, and delete;
- file upload, URL import, validation, progress, and completion;
- document metadata and processing stages;
- reader navigation, search, table of contents, reading settings, annotations,
  book mode, original-file fallback, and processing failure states;
- technical-term categories, explanations, confidence, occurrences, and
  feedback;
- grounded document chat, source labels, and errors;
- reading-room presets, ambient layers, music, and mixer controls.

The remaining literal UI values are proper nouns/service identifiers
(`NexaRead`, `nexaread-web`) and the example URL placeholder.

## Files changed

Backend:

- `backend/app/api/routes/auth.py`
- `backend/app/schemas/auth.py`
- `backend/tests/test_auth_api.py`

Localization infrastructure and dictionaries:

- `frontend/lib/i18n.ts`
- `frontend/lib/i18n.test.ts`
- `frontend/lib/auth-api.ts`
- `frontend/lib/auth-api.test.ts`
- `frontend/locales/{vi,en}/{common,auth,errors,library,upload,reader,chat,landing}.json`
- `frontend/components/i18n-provider.tsx`
- `frontend/components/i18n-provider.test.tsx`
- `frontend/components/language-selector.tsx`
- `frontend/app/layout.tsx`

Localized pages and components:

- `frontend/app/page.tsx`
- `frontend/app/page.test.tsx`
- `frontend/app/health/page.tsx`
- `frontend/app/library/page.tsx`
- `frontend/app/upload/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/account/page.tsx`
- `frontend/app/account/sessions/page.tsx`
- `frontend/components/auth-form.tsx`
- `frontend/components/site-shell.tsx`
- `frontend/components/session-manager.tsx`
- `frontend/components/confirm-dialog.tsx`
- `frontend/components/document-library.tsx`
- `frontend/components/document-detail.tsx`
- `frontend/components/upload-form.tsx`
- `frontend/components/document-reader.tsx`
- `frontend/components/document-chat.tsx`
- `frontend/components/keyword-glossary.tsx`
- `frontend/components/reader-toolbar.tsx`
- `frontend/components/reader-tools.tsx`
- `frontend/components/reader-block.tsx`
- `frontend/components/page-turn-controller.tsx`
- `frontend/components/page-spread.tsx`
- `frontend/components/book-reader.tsx`
- `frontend/components/reader-experience.tsx`
- `frontend/components/room-selector.tsx`
- `frontend/components/music-player.tsx`
- `frontend/components/audio-mixer.tsx`

Updated localization-aware component tests:

- `frontend/components/document-library.test.tsx`
- `frontend/components/upload-form.test.tsx`
- `frontend/components/document-reader.test.tsx`
- `frontend/components/document-chat.test.tsx`
- `frontend/components/keyword-glossary.test.tsx`
- `frontend/components/reader-tools.test.tsx`
- `frontend/components/reader-block.test.tsx`
- `frontend/components/auth-form.test.tsx`
- `frontend/components/session-manager.test.tsx`
- `frontend/components/site-shell.test.tsx`

## Validation

Passing checks:

```text
backend/.venv/Scripts/ruff.exe check .
backend/.venv/Scripts/mypy.exe app tests
backend/.venv/Scripts/pytest.exe -q
npm run lint
npm run type-check
npm test -- --maxWorkers=1
npm run build
```

Final automated totals are 97 backend tests and 63 frontend tests. ESLint
passes with zero warnings. The production Next.js build generates all ten
application routes successfully. Vitest still emits non-fatal jsdom notices
for the unimplemented `HTMLMediaElement.pause()` method.

## Remaining risks and Phase 3 boundary

- A browser-level bilingual smoke test remains part of the Phase 8 system
  quality gate.
- The live PostgreSQL migration limitation from Phase 1 remains unchanged;
  Docker Desktop is unavailable on this host.
- Phase 3 may change document classification, layout analysis, and normalized
  layout metadata, but must preserve private ownership, stable content-block
  anchors, sanitized content, and citation traceability.
