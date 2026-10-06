# Research Publication System — Developer Specification

## 1. Purpose

Build a simple, static, GitHub-based research publication website using Astro.

The system should make it easy to publish research created by humans or AI agents without requiring those agents to understand the website's internal architecture. The website is a rendering and discovery layer over a deliberately small publication format.

The primary design principle is:

> **One publication = one self-contained publication package.**

A publication may be a research report, PDF, Excel model, or standalone JSX artifact. Each first-class publication is independent, searchable, directly shareable, and addressable by a stable URL.

Research reports may reference other publications by ID, but must not bundle independently useful publications such as Excel models or standalone artifacts.

The repository initially contains the following fixture files in its root:

- `Meridian × Exhibit — Color & Typography Spec.md`
- one Excel model
- one research ZIP
- one PDF
- one JSX artifact

Use these as real sample content while building the first version. Inspect the actual filenames and contents rather than assuming names beyond the branding-spec filename above.

---

## 2. Product Goals

The finished system should provide:

1. A professional research-library homepage with:
   - full-text search
   - simple filters
   - a unified index of all publications
   - direct links to permanent publication URLs

2. Rich research-report pages with:
   - MDX content
   - automatic table of contents
   - active-section scrollspy
   - citations and references
   - charts, figures, tables, callouts, Mermaid diagrams, and cross-publication links
   - consistent screen rendering
   - consistent A4 print/PDF rendering

3. First-class standalone artifact pages for:
   - PDF
   - Excel/XLSX
   - JSX/interactive artifacts

4. A simple ingestion path that allows an AI agent to produce one publication package, ZIP it, and hand it to an importer without understanding Astro routes, search indexing, component folders, or build configuration.

5. Static deployment through GitHub with no database, CMS, authentication system, or application server in v1.

---

## 3. Non-Goals for v1

Do not build:

- a CMS
- user accounts or authentication
- private/unlisted content
- collaborative editing
- an online Excel editor
- arbitrary React/JSX inside normal research reports
- a complex global asset library
- a global bibliography database
- deep content folder taxonomies
- separate storage trees for research, PDFs, spreadsheets, datasets, etc.
- a plugin marketplace
- server-side search
- a database
- a backend API unless strictly required by the static build process
- elaborate workflow/approval software

Keep the system intentionally small.

---

## 4. Core Architecture

### 4.1 One flat publication collection

All imported publications live in one flat collection:

```text
content/
  2026-09-28-european-banking-outlook/
  2026-09-30-european-bank-model/
  2026-10-03-sample-pdf/
  2026-10-05-interactive-valuation-artifact/
```

There should be no top-level storage split such as:

```text
research/
pdfs/
excel/
artifacts/
datasets/
```

Publication type is metadata, not filesystem architecture.

### 4.2 Publication package

Every directory under `content/` represents exactly one first-class publication.

Every publication package contains:

```text
<publication-id>/
  manifest.yaml
  <primary file>
  <optional internal rendering assets>
```

A research report may additionally contain:

```text
index.mdx
references.yaml
chart-01.csv
figure-01.svg
diagram-01.mmd
```

A standalone Excel publication may be:

```text
manifest.yaml
model.xlsx
```

A standalone PDF publication may be:

```text
manifest.yaml
paper.pdf
```

A standalone JSX artifact may be:

```text
manifest.yaml
artifact.jsx
```

### 4.3 Internal asset rule

Files may live inside a publication package only when they are necessary to render or understand that one publication.

Examples of valid internal assets:

- CSV used by a chart in the report
- SVG figure used only in that report
- local image
- Mermaid source
- small JSON dataset used only by an embedded visualization

Examples that should become separate publications instead:

- Excel valuation model
- reusable dataset
- standalone interactive visualization
- separately useful PDF
- another research report

If a user should reasonably be able to search for it, share it directly, or open it independently, it should be its own publication package.

---

## 5. Publication Manifest v1

Use `manifest.yaml` as the source of publication metadata.

Keep schema v1 small.

Required fields:

```yaml
schema: 1

id: 2026-09-28-european-banking-outlook
title: European Banking Outlook
date: 2026-09-28

kind: research
format: mdx
primary: index.mdx
```

Optional fields:

```yaml
summary: >
  Analysis of profitability, capital requirements,
  consolidation and valuation across European banks.

tags:
  - banking
  - europe
  - capital-markets

related:
  - 2026-09-30-european-bank-model
```

### 5.1 Allowed `kind`

For v1:

```text
research
artifact
```

Do not create a large type taxonomy.

### 5.2 Allowed `format`

For v1:

```text
mdx
pdf
xlsx
jsx
```

The combination of `kind` and `format` controls rendering.

Examples:

```text
research + mdx  -> research publication renderer
artifact + pdf  -> PDF viewer
artifact + xlsx -> workbook viewer
artifact + jsx  -> interactive artifact renderer
```

If a legacy research PDF must be published as-is, use:

```text
kind: research
format: pdf
```

The renderer should still be chosen primarily by `format`.

### 5.3 Publication IDs

Use:

```text
YYYY-MM-DD-short-descriptive-slug
```

Example:

```text
2026-09-28-european-banking-outlook
```

Rules:

- lowercase
- ASCII
- hyphen-separated
- stable after publication
- unique across the repository
- do not derive identity from folder nesting

The publication ID is the canonical identifier used for cross-publication references.

---

## 6. Canonical URLs

Keep routing deterministic.

Recommended routes:

```text
/research/<publication-id>/
/artifact/<publication-id>/
```

The route is derived from `kind`.

Do not hard-code URLs inside report content when referencing another publication. Resolve publication IDs through the site registry.

A publication ID must remain stable even if its title later changes.

---

## 7. Research Authoring Contract

### 7.1 MDX is semantic, not visual

Normal research reports use MDX.

The report should contain research meaning and structure, not branding or page-layout instructions.

Do not place in MDX:

- hex colors
- font declarations
- margins
- spacing values
- responsive breakpoints
- print dimensions
- CSS classes intended only for branding
- arbitrary React imports

Branding must be controlled by the site design system.

### 7.2 Keep the MDX vocabulary small

Use ordinary Markdown wherever possible.

Approved v1 publication components should be limited to approximately:

```text
Chart
Figure
Table
Callout
Cite
PublicationRef
Mermaid
```

Example:

```mdx
# European Banking Outlook

## Executive Summary

European bank profitability remained resilient.<Cite id="ecb-fsr-2026" />

## Capital Position

<Chart
  src="./cet1-ratios.csv"
  type="line"
  title="European bank CET1 ratios"
/>

The underlying model is available separately:

<PublicationRef id="2026-09-30-european-bank-model" />
```

Do not allow arbitrary interactive JSX in ordinary research MDX.

### 7.3 Automatic table of contents

Research pages should derive their table of contents from headings.

Desktop behavior:

- left-side table of contents
- `h2` and `h3` hierarchy
- active heading highlighted as the reader scrolls
- clicking a heading scrolls to the section

Mobile behavior may use a collapsible contents control.

Authors and AI agents must not manually maintain the table of contents.

---

## 8. References and Citations

Research packages may include a local:

```text
references.yaml
```

Example:

```yaml
ecb-fsr-2026:
  title: Financial Stability Review
  publisher: European Central Bank
  date: 2026
  url: https://example.com
```

Research MDX references sources using:

```mdx
<Cite id="ecb-fsr-2026" />
```

The publication renderer should:

- assign visible citation numbering based on first appearance
- render citations as linked reference markers
- generate a Sources/References section at the bottom
- support repeated references without duplicate bibliography entries
- render citations meaningfully in print/PDF
- fail validation when a referenced citation ID does not exist

Do not introduce a global bibliography in v1.

---

## 9. Cross-Publication References

Research may reference other research or artifacts.

Use:

```mdx
<PublicationRef id="2026-09-30-european-bank-model" />
```

The renderer resolves:

- title
- kind
- format
- URL
- optional summary

The MDX should not contain the other publication's hard-coded route.

Manifest-level relationships may also use:

```yaml
related:
  - 2026-09-30-european-bank-model
```

Use `related` for general relationship UI and `<PublicationRef>` for references at a specific location inside a report.

A missing referenced publication should fail validation or surface a clear build warning during development. Prefer failing CI for published content.

---

## 10. Data Visualizations

### 10.1 Research chart contract

Charts used in normal research should be driven by:

- structured data files such as CSV/JSON
- semantic chart props
- central rendering components

Example:

```mdx
<Chart
  src="./revenue.csv"
  type="bar"
  title="Revenue by business line"
/>
```

Do not encode branding colors into individual chart data files.

The chart component should apply design-system tokens centrally.

### 10.2 Screen and print parity

A chart must communicate the same information in:

- interactive web rendering
- A4 PDF rendering

Interactive behavior is optional enhancement, not required to understand the chart.

Prefer SVG-compatible rendering for printable charts.

Recharts is acceptable for v1 if it satisfies print output cleanly. Mermaid is appropriate for diagrams.

---

## 11. Standalone Artifact Renderers

### 11.1 PDF

A PDF publication gets its own permanent publication page.

Requirements:

- inline read-only viewing
- open/download original PDF
- publication metadata
- responsive presentation
- usable fallback if embedded viewing is unsupported

Prefer PDF.js if needed for a consistent viewer. A simpler standards-based embedded viewer is acceptable for the first prototype if it behaves reliably.

### 11.2 Excel/XLSX

Excel is read-only in v1.

Requirements:

- sheet tabs
- visible rows/columns and cell values
- basic formatting where practical
- scrolling
- original `.xlsx` download
- no editing
- no macro execution
- no attempt to reproduce full Excel functionality

SheetJS or equivalent is acceptable for parsing workbook data.

If advanced workbook features cannot be rendered correctly, degrade gracefully and make the original workbook downloadable.

### 11.3 JSX artifact

Standalone JSX artifacts are allowed more freedom than normal research MDX.

Requirements:

- each JSX artifact is its own publication
- render through a dedicated artifact host
- do not let artifact code become part of the research MDX vocabulary
- keep artifact code isolated from site internals
- prefer an iframe/sandbox or equivalent boundary where practical
- the artifact must not be able to alter global navigation or publication metadata
- provide metadata and a stable artifact URL around the hosted experience

The fixture JSX artifact in the repo root should be used to prove this path works.

---

## 12. Search and Discovery

The homepage should primarily function as a research/publication library.

Minimum v1 functionality:

- full-text search
- filter by `kind`
- filter by tag
- filter by year/date
- clear/reset filters
- cards/list rows showing:
  - title
  - date
  - kind/format
  - summary
  - tags

The search index should include:

- titles
- summaries
- tags
- research body text
- relevant artifact metadata

Prefer a static search solution such as Pagefind so no backend is required.

Do not build advanced faceted-search infrastructure in v1.

---

## 13. Homepage

The site is a professional publication library first, not a conventional personal portfolio.

The homepage should include:

1. a restrained introductory header/hero
2. search
3. simple filters
4. publication index
5. optional featured/recent section if easy to support

Do not build elaborate marketing sections unless they are directly supported by the branding spec.

The primary job of the homepage is helping a visitor quickly find and open research or artifacts.

---

## 14. Design System Integration

The repository root contains:

```text
Meridian × Exhibit — Color & Typography Spec.md
```

Treat this file as the visual source of truth for v1 colors and typography.

Important separation:

- publication packages contain semantic content
- the site controls visual presentation
- publication files must not duplicate brand colors or fonts

Translate the branding specification into centralized design tokens/CSS variables.

Examples:

```text
--color-text
--color-muted
--color-background
--color-surface
--color-primary
--color-secondary
--color-accent
--font-body
--font-heading
--font-data
```

Use semantic chart roles rather than chart-specific hard-coded colors.

The site should make it possible to change branding centrally without editing old research packages.

---

## 15. A4 Print and PDF Output

### 15.1 Single source

For MDX research:

```text
index.mdx
  -> web publication
  -> A4 PDF
```

Do not maintain a separately authored PDF version.

### 15.2 Print requirements

Provide a dedicated print stylesheet with:

- A4 page size
- print-safe typography
- controlled page breaks
- removal of website navigation and interactive controls
- figures/tables kept together where practical
- readable URLs/cross-publication references
- citation/reference section
- page numbering where practical
- predictable margins
- no horizontal clipping
- charts rendered in print-safe form

### 15.3 Generated downloadable PDF

Every `research + mdx` publication should expose an official generated PDF download.

Use a deterministic headless-browser step, preferably Playwright/Chromium, after the static site build.

Recommended conceptual flow:

```text
Astro build
  -> render print route
  -> Playwright generates A4 PDF
  -> PDF saved into final static output
```

The PDF download must contain only the research publication itself.

It must not bundle related Excel models, datasets, or other artifacts.

Cross-publication references should render as readable titles and URLs/identifiers in the PDF.

---

## 16. Import and Ingestion

### 16.1 AI-facing contract

AI agents should not know the website internals.

They should only need to create a valid publication package.

Transport may be:

- directory
- ZIP

ZIP is a transport format, not the content architecture.

### 16.2 Import command

Implement a deterministic local command such as:

```bash
pnpm publication:add ./incoming/publication.zip
```

or:

```bash
pnpm publication:add ./incoming/publication-directory
```

The importer should:

1. unpack to a temporary location if needed
2. find and parse `manifest.yaml`
3. validate schema
4. validate ID and folder name
5. validate primary file exists
6. validate internal file references
7. validate citation IDs
8. validate cross-publication references where possible
9. reject duplicate publication IDs
10. copy exactly one package to:

```text
content/<publication-id>/
```

11. leave routing/search/indexing to the website build

The importer must not ask an AI or developer to decide which category folder should contain the publication.

### 16.3 Raw fixture files in the initial repository

The initial repo contains raw example inputs at the root.

During initial development:

- inspect all four fixture content files
- convert/import each into the publication model
- preserve the fixture files until their role is understood
- use the research ZIP as the main ingestion-contract test
- create a minimal manifest for raw PDF/XLSX/JSX fixtures if they do not already have one
- do not treat fixture filenames as long-term architecture

The resulting site should demonstrate all four renderer paths using these real fixtures.

---

## 17. Validation

Provide a command such as:

```bash
pnpm publication:validate
```

It should validate all packages.

At minimum check:

- valid YAML
- schema version
- required manifest fields
- unique IDs
- allowed `kind`
- allowed `format`
- primary file exists
- primary file extension matches format
- research MDX compiles
- citation IDs resolve locally
- local asset paths resolve
- related publication IDs resolve
- `<PublicationRef>` IDs resolve
- no path traversal outside the publication package
- duplicate content directory names
- malformed publication IDs

Validation should run in CI before deployment.

---

## 18. Suggested Technical Stack

Prefer:

- Astro
- TypeScript
- MDX
- React only for interactive islands/viewers/artifacts
- a schema validator such as Zod
- Mermaid for diagrams
- Recharts or equivalent for research charts
- Pagefind for static full-text search
- SheetJS or equivalent for XLSX parsing
- Playwright for generated A4 PDFs
- GitHub Actions
- GitHub Pages

Use the smallest dependency set that satisfies the spec.

Do not convert the site into a React SPA.

Astro should remain responsible for static page generation and routing.

---

## 19. Suggested Repository Shape

The exact internal structure may vary, but keep it understandable.

A reasonable starting point:

```text
/
├── Meridian × Exhibit — Color & Typography Spec.md
├── spec.md
├── content/
│   └── <publication-id>/
│       ├── manifest.yaml
│       └── ...
├── src/
│   ├── components/
│   │   ├── publication/
│   │   ├── research/
│   │   ├── charts/
│   │   └── viewers/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   └── lib/
├── scripts/
│   ├── publication-add.*
│   ├── publication-validate.*
│   └── generate-pdfs.*
├── public/
└── package.json
```

Do not expose this internal repository layout to AI publishing agents. Their contract stops at the publication package.

---

## 20. GitHub Build and Deployment

Target a fully static build.

GitHub Actions should:

1. install dependencies
2. run publication validation
3. build Astro
4. build static search index
5. generate A4 PDFs for MDX research
6. ensure generated downloads are included in the final output
7. deploy to GitHub Pages

Make site/base URL configurable so the project can work with:

- default GitHub Pages project URLs
- a later custom domain

No manual post-build file copying should be required for normal publishing.

---

## 21. Fixture Acceptance Scenario

The first implementation is complete only when the repository's starting fixtures demonstrate the system end-to-end.

Expected result:

### Research ZIP

- imported into one publication package
- MDX research page renders
- table of contents works
- citations/references work if present
- internal charts/assets render
- generated A4 PDF is downloadable
- appears in search/homepage

### Excel model

- becomes an independent publication
- read-only workbook viewer works
- original workbook is downloadable
- appears in search/homepage
- can be referenced from research by publication ID

### PDF

- becomes an independent publication
- viewer works
- original PDF is downloadable
- appears in search/homepage

### JSX artifact

- becomes an independent publication
- interactive artifact renders through its dedicated host
- does not alter site shell/global layout
- appears in search/homepage
- has a permanent URL

---

## 22. UX Acceptance Criteria

The site should feel simple even if the internals support multiple formats.

A visitor should be able to:

1. open the homepage
2. search or filter publications
3. open any item
4. understand whether it is research, a PDF, a workbook, or an interactive artifact
5. share the page URL
6. move around long research via the table of contents
7. follow references to other publications
8. download the original artifact where applicable
9. download an A4 PDF for MDX research

A publisher/AI agent should be able to:

1. create one valid publication package
2. ZIP it
3. hand it to the importer
4. validate
5. commit
6. deploy

The publisher should not need to manually modify routes, search indexes, global asset folders, or category directories.

---

## 23. Engineering Principles

When implementation choices are ambiguous, prefer the option that best preserves these principles:

1. **One publication, one package.**
2. **Flat storage, rich metadata.**
3. **Content semantics are separate from visual design.**
4. **AI agents target a small publication contract, not the Astro codebase.**
5. **Independent artifacts are linked, not bundled into research reports.**
6. **MDX is the single source for web and A4 PDF research output.**
7. **Static generation is the default.**
8. **React is an island, not the application shell.**
9. **Build-time automation replaces manual publishing steps.**
10. **Simplicity is a feature; avoid speculative abstractions.**

---

## 24. Implementation Order

Suggested order:

### Phase 1 — Foundation

- inspect fixture files
- read branding spec
- create Astro/TypeScript project
- create publication manifest schema
- create publication scanner/registry
- implement validation
- import the four fixtures

### Phase 2 — Core UI

- global shell
- homepage/library
- publication cards
- search/filter UI
- canonical routes

### Phase 3 — Renderers

- MDX research renderer
- table of contents/scrollspy
- citations/references
- cross-publication references
- PDF viewer
- XLSX viewer
- JSX artifact host

### Phase 4 — Print

- A4 print stylesheet
- print route
- Playwright PDF generation
- downloadable research PDFs

### Phase 5 — Publishing Workflow

- `publication:add`
- CI validation
- search indexing
- GitHub Pages deployment
- README documenting the human/AI publishing workflow

Avoid implementing speculative features beyond these phases unless needed to satisfy the fixture scenarios or acceptance criteria.
