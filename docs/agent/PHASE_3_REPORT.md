# NexaRead AI Product Upgrade — Phase 3 Report

## Scope and outcome

- Phase: `PHASE_3`
- Tasks: `NR-300` through `NR-360`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 3 adds a source-faithful document layout intelligence layer and the
processing UX required to expose its results. Raw parser text remains the
authority for search, RAG evidence, citations, and offsets; normalized display
text and semantic layout metadata are additive.

## Repository layout skill

`skills/document-layout-intelligence/` defines the binding workflow for future
parser, layout, reader, and citation-sensitive changes. It includes:

- `SKILL.md` with source/display invariants, deterministic stages, Vietnamese
  rules, AI-repair limits, validation, and handoff requirements;
- `README.md` and `agents/openai.yaml`;
- `examples/source-display-contract.json`;
- `evaluation/layout-cases.json`.

`AGENTS.md` routes relevant repository work through this skill.

## Source and display fidelity

`ContentBlock.text` remains the legacy source-truth field and is constrained to
equal `source_text`. The additive contract persists:

- `display_text`;
- ordered `transformation_log`;
- `transformation_confidence`;
- `needs_review`;
- `source_anchor` with page, geometry, parser IDs, database block IDs, and
  source offsets.

Search, chunking, retrieval, citation excerpts, and evidence validation
continue to use source text. Display normalization never translates or
invents content.

## Deterministic layout pipeline

The pipeline under `backend/app/services/document_layout/` performs:

1. language and document-type detection;
2. repeated-margin suppression and reading-order annotation;
3. conservative paragraph/display reconstruction and dehyphenation;
4. Vietnamese Unicode, spacing, and punctuation normalization;
5. heading, list, caption, footnote, and reference detection;
6. hierarchy and semantic pagination metadata;
7. quality scoring and warnings;
8. persistence with source anchors intact.

Vietnamese coverage includes every required heading prefix, list marker, and
caption prefix. Ambiguous abbreviations, proper names, and semantic hyphens
remain unchanged or are flagged for review. The default pipeline is
deterministic and idempotent.

## Semantic pagination contract

Explicit persisted fields include:

```text
semantic_role
heading_level
keep_with_next
avoid_break_inside
break_before
break_after
indent_level
text_align
is_first_paragraph
is_chapter_opening
caption_for_asset_id
footnote_reference
source_page_number
```

They are returned by the Reader API and mirrored in the frontend content-block
type.

## Optional AI-assisted repair

AI repair is disabled by default and provider-injected. It is eligible only for
low layout confidence, unresolved heading hierarchy, complex reading order, or
severely broken tables. The provider contract has no output-text field: it can
return only page-local ordering, grouping, semantic roles, and heading levels.

Every proposal must account for each input block exactly once. Cross-page
grouping/reordering, unknown or duplicate IDs, unsupported roles, missing
confidence/reason, and invalid heading levels are rejected. Applied repairs
preserve text, display text, offsets, numbers, and source anchors. Audit records
contain input IDs, output mapping, confidence, reason, provider/model, status,
and timestamp without copying source text. Disabled, unavailable, failed, or
invalid providers use the deterministic result unchanged.

## Processing UX

The canonical processing flow is:

```text
UPLOADING
SAFETY_CHECK
EXTRACTING
STRUCTURING
READABLE
TOC
INDEXING
COMPLETE
```

Reader content becomes available at `READABLE` while keyword/vector indexing
continues. The final document status remains `AI_READY`, while the processing
job stage is `COMPLETE`.

Document detail now exposes detected/effective document type, language, source
page count, chapter count, layout quality score/label, and warnings. The
localized upload/detail UI shows all eight stages and provides original-file,
clean-reader, document-type override, and reprocess controls. Reprocessing
copies the immutable source into a new `DocumentVersion`, preserving the prior
version and its annotations in storage.

## Files changed

Repository guidance:

- `AGENTS.md`
- `skills/document-layout-intelligence/SKILL.md`
- `skills/document-layout-intelligence/README.md`
- `skills/document-layout-intelligence/agents/openai.yaml`
- `skills/document-layout-intelligence/examples/source-display-contract.json`
- `skills/document-layout-intelligence/evaluation/layout-cases.json`

Backend implementation:

- `.env.example`
- `backend/app/core/config.py`
- `backend/app/models/document.py`
- `backend/app/schemas/document.py`
- `backend/app/schemas/reader.py`
- `backend/app/api/routes/documents.py`
- `backend/app/services/normalized_document.py`
- `backend/app/services/document_parser.py`
- `backend/app/services/processing.py`
- `backend/app/services/documents.py`
- `backend/app/services/url_documents.py`
- `backend/app/services/reader.py`
- `backend/app/services/document_layout/{__init__,ai_repair,caption_detection,footnote_detection,heading_detection,language,layout_rules,list_detection,paragraph_reconstruction,pipeline,quality,vietnamese_normalizer}.py`
- `backend/migrations/versions/20260723_0008_source_fidelity.py`
- `backend/migrations/versions/20260723_0009_semantic_layout.py`
- `backend/migrations/versions/20260723_0010_processing_ux.py`

Backend tests and evaluation:

- `backend/tests/test_ai_layout_repair.py`
- `backend/tests/test_document_layout.py`
- `backend/tests/test_layout_models.py`
- `backend/tests/test_processing_ux.py`
- `backend/tests/test_documents.py`
- `backend/tests/test_reader_api.py`
- `evaluation/layout_golden_dataset.json`
- `evaluation/run_layout_evaluation.py`
- `evaluation/reports/layout-report.json`

Frontend:

- `frontend/lib/documents-api.ts`
- `frontend/components/processing-timeline.tsx`
- `frontend/components/processing-timeline.test.tsx`
- `frontend/components/document-detail.tsx`
- `frontend/components/document-detail.test.tsx`
- `frontend/components/upload-form.tsx`
- `frontend/components/upload-form.test.tsx`
- `frontend/components/document-reader.tsx`
- `frontend/components/document-reader.test.tsx`
- `frontend/locales/{vi,en}/{upload,library,reader}.json`

Documentation:

- `README.md`
- `docs/agent/PHASE_3_REPORT.md`

## Validation

Passing final checks:

```text
backend/.venv/Scripts/ruff.exe check app tests migrations ../evaluation/run_layout_evaluation.py
backend/.venv/Scripts/mypy.exe app tests
backend/.venv/Scripts/pytest.exe -q
backend/.venv/Scripts/python.exe ../evaluation/run_layout_evaluation.py
backend/.venv/Scripts/alembic.exe -c alembic.ini heads
backend/.venv/Scripts/alembic.exe -c alembic.ini upgrade 20260723_0007:20260723_0010 --sql
backend/.venv/Scripts/alembic.exe -c alembic.ini downgrade 20260723_0010:20260723_0007 --sql
npm run lint
npm run type-check
npm test -- --maxWorkers=1
npm run build
```

Final totals are 144 backend tests and 66 frontend tests. Layout evaluation
passes 26/26 cases with source fidelity `1.0`. Alembic reports one head at
`20260723_0010`; offline upgrade and downgrade SQL generation pass. The
production Next.js build generates all ten application routes.

## Remaining risks and Phase 4 boundary

- Live PostgreSQL upgrade/downgrade remains unverified because Docker Desktop
  is unavailable on this host. Offline PostgreSQL SQL generation and migration
  control tests pass.
- Vitest emits non-fatal jsdom notices for the unimplemented
  `HTMLMediaElement.pause()` method.
- No hosted layout-repair provider is selected automatically. Enabling the
  feature without an injected adapter intentionally uses the deterministic
  fallback.
- Phase 4 may change pagination and rendering, but must consume the semantic
  fields without weakening source-text authority, source anchors, annotations,
  or citations.
