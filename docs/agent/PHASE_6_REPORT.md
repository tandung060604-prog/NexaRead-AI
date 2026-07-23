# NexaRead AI Product Upgrade — Phase 6 Report

## 1. Summary

- Phase: `PHASE_6`
- Tasks: `NR-600`, `NR-610`, `NR-620`, `NR-630`
- Implementation date: `2026-07-23` (`+07:00`)

Phase 6 replaces the decorative landing hero with a complete Vietnamese-first
marketing experience. The public route uses its own responsive shell instead
of the authenticated application sidebar, demonstrates the real reader value
with a code-native product preview, and describes only capabilities and privacy
controls implemented by the product.

## 2. Files changed

### Created

- `frontend/public/og.png`
- `docs/agent/PHASE_6_REPORT.md`

### Modified

- `README.md`
- `frontend/.env.example`
- `frontend/app/globals.css`
- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`
- `frontend/app/page.test.tsx`
- `frontend/components/site-shell.tsx`
- `frontend/components/site-shell.test.tsx`
- `frontend/locales/en/landing.json`
- `frontend/locales/vi/landing.json`

## 3. Public shell

- No application sidebar appears on `/`, `/login`, `/register`, or `/health`.
- The sticky header contains product, feature, how-it-works, audience,
  security, FAQ, login, and free-start navigation.
- Desktop, tablet, and mobile layouts preserve all navigation through either
  direct links or an accessible menu.
- Language and light/dark theme controls are available in both desktop and
  compact navigation.
- Header targets use a scroll offset, so sticky navigation does not cover
  section headings.

## 4. Hero and product preview

- The requested Vietnamese headline, subtitle, and two CTAs are present.
- The product preview is live HTML/CSS rather than a decorative background
  image. It shows:
  - book reader and TOC
  - highlighted source text
  - source page citation
  - grounded assistant answer
  - reading progress
  - saved note and Vietnamese support
- The hero does not load raster imagery, protecting initial rendering and
  layout stability.

## 5. Landing content

- Problem statement for long PDFs, broken responsive layout, lost knowledge,
  and ungrounded AI
- Three-step upload, structure, and grounded-learning flow
- Six feature cards covering reader, layout, citations, private library,
  annotations, and cross-device progress
- Five target audiences
- Implemented privacy and source-integrity controls
- Six required FAQs, including explicit current OCR limits
- Final CTA and footer
- Full Vietnamese and English dictionaries

## 6. Design direction

- Warm premium “reading room meets digital knowledge workspace” direction
- Restrained forest, cream, amber, and terracotta palette
- Serif editorial headings paired with clear sans-serif interface text
- Minimal gradients, no excessive glassmorphism, and no competing background
- Mobile-first spacing and 44px minimum interactive targets
- Local light/dark themes and a `prefers-reduced-motion` override
- Product visuals use CSS and existing Lucide icons

## 7. Social metadata

The `sites-building` workflow produced one project-bound Open Graph image with
the built-in image generation tool:

- Saved asset: `frontend/public/og.png`
- Dimensions: `1731×909`
- Exact primary copy: `NexaRead AI` and
  `Đọc sâu hơn. Luôn dẫn lại nguồn.`

The final prompt requested a landscape editorial social card in the landing
palette with a book-reader vignette, amber highlight, progress indicator,
source citation at page 47, exact Vietnamese headline, and no unsupported
claims. `NEXT_PUBLIC_SITE_URL` supplies the canonical metadata origin and
defaults to local development in the example environment.

## 8. Tests and validation

- Public shell test covers:
  - no app sidebar
  - all required navigation
  - login/free CTA
  - mobile menu state
  - public light/dark theme
- Landing tests cover:
  - exactly one H1
  - hero and registration CTA
  - semantic product preview
  - all required sections
  - format, privacy, citation, and OCR claims
  - absence of an unsupported model-training claim

Commands:

- `npm run lint`
- `npm run type-check`
- `npm test -- --maxWorkers=1`
- `npm run build`
- Focused `app/page.test.tsx` and `components/site-shell.test.tsx` checks after
  the final responsive adjustment

Results:

- ESLint: pass
- TypeScript: pass
- Vitest: 26 files / 94 tests, pass with one worker
- Next.js production build: pass; 11 routes generated

## 9. Manual verification checklist

- Open `/` at 375×812, 768×1024, 1280×800, 1440×900, and 1920×1080.
- Verify the mobile/tablet menu exposes all section links, login, and CTA.
- Follow every sticky-header anchor and confirm the heading is not obscured.
- Toggle light/dark and Vietnamese/English.
- Tab from the header through hero CTAs, citation preview, FAQ summaries, and
  final CTA.
- Enable reduced motion at OS/browser level and confirm movement is removed.
- Verify social preview metadata uses the canonical site origin in the target
  environment.

## 10. Known limitations and out-of-scope confirmation

- The public theme selection is local to the current page session; persistent
  account reader preferences remain separate.
- Browser-level screenshots, accessibility scanning, and viewport automation
  are part of Phase 8 quality gates.
- No production deployment was performed because this goal is operating on the
  local application and the repository has no `.openai/hosting.json`.
- No backend, database, retrieval, citation, or document-processing behavior
  changed in Phase 6.
