# NexaRead AI Product Upgrade — Phase 4 Report

## Scope and outcome

- Phase: `PHASE_4`
- Tasks: `NR-400` through `NR-450`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 4 replaces fixed-height book splitting with measured pagination, removes
nested page scrolling, introduces four persisted reading modes, delivers a
responsive accessible book experience, simplifies reader information
architecture, and synchronizes reading personalization to the signed-in
account.

## Reader and pagination

- Hidden DOM measurement uses actual rendered heights and safe text ranges.
- Page maps are cached by document revision, viewport, typography, width, and
  reading mode, then invalidated after relevant changes.
- Keep-with-next, avoid-break, explicit page breaks, long-text fragmentation,
  source offsets, highlights, and oversized assets are preserved.
- Book pages never add nested vertical scrolling; late overflow feeds back into
  pagination.

## Reading modes and book design

- Canonical modes are `original`, `clean`, `book`, and `study`.
- The selected mode is restored per user and document; legacy mode names are
  normalized.
- Book mode uses one page on narrow screens and two balanced pages on desktop,
  with cover/title leaves, chapter openings on the right, natural blank pages,
  spine, paper texture, page headers, and page numbers.
- Keyboard, swipe, edge-tap, reduced-motion, focus indicators, screen-reader
  labels, and 44px navigation targets are covered.

## Information architecture

- The header exposes library navigation, document/chapter context, distinct
  source and reading page positions, modes, settings, progress, and fullscreen.
- The left TOC collapses.
- The right panel renders one tab at a time: AI, Search, Notes, or Terms.
- Focus mode removes all auxiliary panels.
- Citation navigation continues to target stable source blocks and displays the
  source page.

## Account personalization and safe audio

Migration `20260723_0011` adds account-backed mode, room, animation, audio,
volume, language, and keyword-level preferences. Theme, font, size, line
height, reading width, and focus mode remain in the same preference record.

Ambient and page-turn sound default to off, require explicit interaction, honor
volume/mute state, do not autoplay, and stop or mute when disabled or when the
tab becomes hidden.

## Validation

- Backend Ruff: pass.
- Backend strict mypy: 100 files, pass.
- Backend pytest: 145 tests, pass.
- Layout evaluation: 26/26, source fidelity 1.0.
- Alembic: one head at `20260723_0011`; offline PostgreSQL upgrade and
  downgrade SQL pass.
- Frontend ESLint and TypeScript: pass.
- Frontend Vitest: 25 files / 89 tests, pass with one worker.
- Next.js production build: pass, 10 routes.

## Remaining environment risk

Docker Desktop/PostgreSQL is unavailable on this host, so migration 0011 has
not been executed against a live disposable PostgreSQL instance. Offline
PostgreSQL SQL generation and migration-focused tests pass. Vitest emits
non-fatal jsdom `HTMLMediaElement.pause` notices.
