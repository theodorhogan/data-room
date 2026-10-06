# Tido’s Data Room

A static research library built with Astro. Each publication (a research report, PDF, Excel workbook or interactive JSX artifact) is one self-contained package in `content/<id>/` and gets a permanent URL: `/research/<id>/` or `/artifact/<id>/`. Research reports are written in MDX and also published as a generated A4 PDF, unless the package brings its own PDF (manifest `pdf`, such as the authors' original), which is offered instead.

Colors and type follow `Meridian × Exhibit — Color & Typography Spec.md`, implemented in `src/styles/tokens.css`. Packages contain content only, so you can change the branding without editing old publications.

## Requirements

- Node.js 22.19 or later (CI uses Node 24). The scripts are TypeScript run directly by Node.
- For the PDF step: Google Chrome or Microsoft Edge, or Playwright's Chromium (`npx playwright install chromium`).

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open http://localhost:4321. Pages reload when you change a file in `content/`. In dev mode there is no full-text index, so search matches titles, summaries and tags only. The research page shows "Print / save as PDF" in place of the generated PDF download (a report with its own `pdf` shows its download in dev too).

## Validate publications

```bash
npm run publication:validate
```

This checks every package in `content/`: manifest fields, IDs, file types, primary files, MDX vocabulary, citations, asset paths, `related` and `<PublicationRef>` IDs, chart data, and that JSX artifacts build. To check only some packages, pass their folders, for example `npm run publication:validate -- content/2026-04-14-proto-labs-prlb-two-pager`. To check a package before it is in `content/`, run `publication:add` (below); it validates before copying. `npm test` runs the contract tests.

## Add a publication

Make one package (a folder or a ZIP of it) as described in [docs/master-spec.md](docs/master-spec.md). Put it in `incoming/`, a drop-off folder that git ignores (create it if it does not exist), then import it:

```bash
npm run publication:add -- ./incoming/2026-09-28-my-report.zip
```

The importer unpacks the package, validates it, and copies it to `content/<id>/`. References to publications that are not imported yet are warnings at this step and errors in `publication:validate`, so import those publications too before you commit. Nothing else needs changing: the build handles routes, the library and the search index. To update a publication, import it again with `--replace`. Then commit the new folder.

To publish a single raw file, such as a PDF, put it in a folder next to a `manifest.yaml`:

```yaml
schema: 1
id: 2026-09-28-annual-review
title: Annual review
date: 2026-09-28
kind: artifact
format: pdf
primary: paper.pdf
```

Give [docs/master-spec.md](docs/master-spec.md) to an AI agent that writes publications. Part 1 is the framework (which output type fits a task, report structure, exhibit choices, required outputs); Part 2 is the exact package format.

## Build

```bash
npm run build
```

The build validates all packages, builds the site with Astro, indexes it with Pagefind, and prints each research report without its own `pdf` to `dist/research/<id>/<id>.pdf` with headless Chromium. The output in `dist/` is fully static.

The site is built for the root of its host. For a site served from a subpath (a GitHub Pages project URL such as `https://example.github.io/data-room/`), set the deployment URL at build time:

```bash
SITE_URL=https://example.github.io BASE_PATH=data-room npm run build
```

Write `BASE_PATH` without the leading slash: Git Bash on Windows rewrites values that start with `/` into Windows paths. In PowerShell, set the variables first and remove them afterwards, because they stay set for the session:

```powershell
$env:SITE_URL='https://example.github.io'; $env:BASE_PATH='data-room'; npm run build
Remove-Item Env:SITE_URL, Env:BASE_PATH
```

## Deploy locally

```bash
npm run preview
```

This serves `dist/` at http://localhost:4321, including search and the PDF downloads. Any static file server also works for a root build, for example `npx serve dist`. For a subpath build, preview with the same variable, `BASE_PATH=data-room npm run preview`, and open http://localhost:4321/data-room/.

## Deploy to GitHub Pages

The site is published at https://theodorhogan.github.io/data-room/ from this repository (a GitHub Pages project site). `.github/workflows/deploy.yml` validates, tests, type-checks and builds on every pull request and every push to `main`. Runs on `main` (pushes and manual runs) also deploy `dist/` to GitHub Pages.

To set it up (once):

1. Make the repository public. On GitHub Free, Pages only works for public repositories, and a Pages site is public even when its repository is private.
2. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** before the first push to `main`. Otherwise the "Read GitHub Pages URL" step fails; set the source and re-run the workflow (**Actions → Validate, build and deploy → Run workflow**).
3. Push to `main`.

The workflow reads the site URL and base path from Pages, so renaming the repository or moving to a custom domain needs no code change.

The site is kept out of search engines: every page has `<meta name="robots" content="noindex, nofollow">` (`SITE.noindex` in `src/site.config.ts`). The package files (PDF, XLSX, CSV and so on) cannot carry that tag, and a robots.txt only works at the root of a host, not under `/data-room/`; with nofollow on every page, crawlers do not follow the site's links to them, but a file linked from elsewhere could still be indexed.

## Layout

```text
content/<id>/            one folder per publication (the only place content goes)
incoming/                drop-off folder for ZIPs to import (ignored by git)
docs/                    master spec for publishing agents (framework and package format)
scripts/                 publication-add, publication-validate, generate-pdfs
src/lib/                 manifest schema, package reader, validator, MDX rules, chart engine, workbook reader, artifact bundler
src/components/          research components, publication header and lists, PDF/XLSX/JSX viewers
src/pages/               library, /<kind>/<id>/ pages, package files, artifact frame
src/styles/              design tokens, site and A4 print styles
tests/                   contract tests (node --test)
```
