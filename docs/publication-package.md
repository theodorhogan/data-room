# Publication package format (v1)

This is the whole contract for publishing. A publisher, human or AI, produces one package and hands it to the importer. You do not need to know how the website works.

## A package

One publication is one folder:

```text
2026-09-28-european-banking-outlook/
  manifest.yaml        required: metadata
  index.mdx            the primary file (here: a research report)
  references.yaml      research only: the sources you cite
  chart-01.csv         internal assets used by this publication only
  diagram-01.mmd
```

- Send the folder as-is or as a ZIP of it. The ZIP must contain exactly one package.
- Keep files next to the manifest. Use only letters, digits, `.`, `_` and `-` in file names, and start each name with a letter or digit. Names are case-sensitive. On Windows and macOS, rename a file's case with `git mv old.csv Old.csv`; a rename in Explorer or Finder is not picked up by git and breaks the build on Linux. In a research report package, `<id>.pdf` is reserved for the generated PDF (unless the manifest names it as the report's own `pdf`).
- Allowed file types: `.yaml .mdx .csv .json .mmd .txt .svg .png .jpg .jpeg .gif .webp .avif .pdf .xlsx`, plus `.jsx .js` in JSX artifact packages. HTML files are not allowed. An SVG must not contain scripts, event handlers or embedded HTML. Only the primary file may be `.mdx`.
- An internal asset is a file that only this publication needs, such as a chart's CSV. Anything a reader could use on its own (an Excel model, a dataset, a PDF, an interactive tool, another report) is a separate package. The one exception is a research report's own PDF (see `pdf` below). Link to it with `<PublicationRef>` or `related`.
- Do not include colors, fonts, layout or CSS. The site styles every publication.

## manifest.yaml

```yaml
schema: 1

id: 2026-09-28-european-banking-outlook
title: European Banking Outlook
date: 2026-09-28

kind: research        # research | artifact
format: mdx           # mdx | pdf | xlsx | jsx
primary: index.mdx    # extension must match format
pdf: original.pdf     # optional, MDX research reports only: the PDF to download instead of the generated A4 print

summary: >            # optional, shown in the library and in search
  Profitability, capital and consolidation across European banks.
authors:              # optional, shown as the byline (at most 12 names)
  - AMSA Equity Research
tags:                 # optional, from the fixed list below
  - macro
  - report
tickers:              # optional, public companies the publication is mainly about
  - BNP.PA
related:              # optional, IDs of other publications
  - 2026-09-30-european-bank-model
```

- `id` is `YYYY-MM-DD-short-slug`: lowercase ASCII words joined by hyphens. It must be unique and must not change after publication. The folder name equals the ID.
- `date` is a real calendar date (`YYYY-MM-DD`).
- `tags` come from a fixed list: Deep Research, Macro, Financial Model, DCF, CCA, LBO, CTA (comparable transactions), Trading, Report, Equity Research. Write the label or its lowercase-hyphenated form (`deep-research`).
- `pdf` (MDX research reports only, `format: mdx`) names a PDF in the package, such as the authors' original layout. The page's download button offers it, and no A4 PDF is generated for this report.
- `tickers` are stock symbols of the public companies the publication is mainly about: `PRLB`, `BRK.B`, or with an exchange suffix outside the US (`RNO.PA`, `KGX.DE`). They appear as their own filter.
- No other fields are allowed.

| kind + format | Shown as |
| --- | --- |
| `research` + `mdx` | Research report, with an A4 PDF generated from the same source (or the report's own PDF, see `pdf`) |
| `research` + `pdf` | A research paper published as a PDF |
| `artifact` + `pdf` | A PDF document |
| `artifact` + `xlsx` | A read-only workbook (no macros; `.xlsm` is not accepted) |
| `artifact` + `jsx` | An interactive artifact |

## Research reports (MDX)

Write ordinary Markdown: headings, paragraphs, lists, tables, emphasis and links. The table of contents is built from `##` and `###` headings. A `# Title` may only be the first line, and it is dropped because the title comes from the manifest. Links go to `http`, `https` or `mailto` addresses, to `#headings`, or to files in the package. Link other publications with `<PublicationRef>`, never with a site path such as `/research/…`.

Besides Markdown, only these components exist. Every prop is a quoted string.

| Component | Props | Use |
| --- | --- | --- |
| `<Cite id="…" />` | `id` | Cite a source from `references.yaml`. Numbers follow first appearance. Adjacent citations merge into one marker. |
| `<PublicationRef id="…" />` | `id`, `label` | Link another publication by ID. On its own line it renders as a card; inside a sentence as a link. |
| `<Chart … />` | `src`, `type`, `title` (required); `x`, `y`, `series`, `yLabel`, `caption`, `sources`, `orientation`, `highlight`, `stacked`, `scale`, `measure`, `low`, `high`, `label`, `size`, `annotations` | Chart from a CSV or JSON file. |
| `<Table … />` | `src`, `title` (required); `unit`, `caption`, `sources`, `highlight`, `key`, `changes`, `forecast` | Data table from a CSV or JSON file. |
| `<KeyFigures src="…" />` | `src` (required); `title` | The key-figure panel (rating, target, price…) from a CSV with `label,value[,note]` (at most 8 rows). Not an exhibit. |
| `<Figure … />` | `src`, `alt` (required); `title`, `caption`, `sources` | SVG, PNG, JPEG, WebP, GIF or AVIF image. |
| `<Mermaid … />` | `src` (required); `title`, `caption`, `sources` | Diagram from a `.mmd` file. |
| `<Callout type="note">…</Callout>` | `type` (`note`, `important`, `warning`), `title` | Boxed note. Takes Markdown content. |

Not allowed: frontmatter (`---` blocks), `import`/`export`, `{expressions}`, other components, HTML elements (except `<br />`, `<sup>` and `<sub>`), `style` or `class` attributes, Markdown images (use `<Figure>`), and `#` headings after the first line.

### Exhibits

Charts, tables, figures and diagrams are numbered "Exhibit 1, 2, …" automatically.

- `title` is the finding stated as a sentence ("Backlog up 46% in a year"), not the chart's subject.
- `yLabel` (charts) or `unit` (tables) names the measure and unit ("Remaining performance obligations ($bn)").
- `sources` is a space-separated list of citation IDs; they appear under the exhibit and in the references.
- `caption` holds notes on the data.

### Chart data

- `type`: `bar`, `line`, `point`, `range` or `scatter`. `orientation="horizontal"` gives horizontal bars (and, for ranges, a football field).
- On a phone, vertical bars or ranges with named categories (not years or quarters) are drawn horizontally when their names would not fit under the bars. Stacked bars and charts with bands or markers stay upright.
- `x` and `y` name columns (default: the first two). `series` names a column that splits rows into up to four series.
- The first row holds unique, non-empty column names.
- `y` values must be numbers; leave a cell empty for a gap. Write negative numbers with a minus sign.
- For `line` and `point`, an `x` column of real dates (`2026-09-25` or `2026-09`) gives a time axis.
- `highlight` names one x value or series (bars), one series (lines and points), one x value (ranges) or one point label (scatter) to emphasise.
- `measure="change"` marks values as changes: labels carry + and −, and a single series shows gains and losses in the signal colours. `measure="level"` never uses signal colours (a margin that dips below zero stays navy). Without it, a chart with any negative value is read as changes (signed labels; single-series bars in the signal colours).
- `stacked="true"` stacks the series of a vertical bar chart (values of zero or more). `scale="log"` gives a line or point chart a logarithmic axis (values above zero).
- `type="range"` draws one bar from `low` to `high` per `x` value, with an optional point from `y` (guidance range against the result). With `orientation="horizontal"` it is a football field.
- `type="scatter"` plots numeric `x` against numeric `y`; `label` names each point and `size` scales its area. `highlight` names one label.

### Chart annotations

`annotations="./exhibit-03-notes.csv"` adds marks from a CSV with the columns `kind,from,to,value,label` (and optional `series`). `from` and `to` are x values of the chart: categories, or dates within the chart's date range. On a scatter chart, a note's `from` is a point label. On a log scale, `value` must be above zero.

| kind | Draws | Limit |
| --- | --- | --- |
| `band` | A quiet background band from `from` to `to`, labelled at the top (eras, regimes) | any |
| `highlight` | The highlighted period: a lilac band with its label | one |
| `forecast` | The forecast period from `from` (to `to` or the end), labelled FORECAST or `label` | one |
| `note` | One pointer: a ring on the value at `from` (or at `value`), a leader line and a short `label` | one |
| `line` | With `value`: a dashed reference line at that level of the value axis (price, target, average). With `from` instead: a dashed marker at that x value (an event date, a price on a histogram). `label` names it; without one, a level line prints its value | any |

Bands, the highlighted period and the forecast need categories or dates along the horizontal axis. Note labels have at most 40 characters. A note needs a value at `from` (or its own `value`).

### Table roles

A row is named by the text of its first cell, a column by its header. Separate several names with `|`.

- `highlight`: the one row that must stand out.
- `key`: rows of key values (set in a heavier weight).
- `changes`: columns or rows of changes, shown with + and − in the signal colours.
- `forecast`: columns of estimates, shaded as a forecast period.

Numbers keep fixed decimals per column. A table organised by rows (revenue, growth, EPS…) keeps the decimals of each row instead.
- In a `<Table>` or `<Chart>` data file, a column named `source_id` or `source_ids` holds space-separated citation IDs. Each must exist in `references.yaml`; they render as links to the references.

### references.yaml

```yaml
ecb-fsr-2026:
  title: Financial Stability Review     # required
  publisher: European Central Bank
  author: Jane Doe                      # optional, text or list
  date: 2026-05-28                      # or a year
  url: https://www.ecb.europa.eu/…
  note: Seen only in a summary.         # optional
```

Every `<Cite>` and `sources` ID must exist here. Only cited sources appear in the report.

### Diagrams

Mermaid diagrams render in the site's colors and fonts, so `%%{init}%%` and other configuration blocks, `style`, `classDef`, `linkStyle` and inline `style=` attributes are not allowed. A diagram's own `title` line is replaced by the exhibit title when `<Mermaid>` has one. A left-to-right timeline or flowchart that is too wide for the reading column is laid out top to bottom.

## Artifacts

- **PDF**: the file must be a real PDF. It is shown inline and offered for download.
- **XLSX**: the viewer shows every visible sheet with the values last calculated in Excel, formulas, and the workbook's formatting: fills, fonts, borders, colour scales and simple value rules. Grouped rows and columns are shown expanded, and the viewer opens on the sheet that was active when the workbook was saved. Nothing is recalculated or executed; charts, images (a picture placed in a cell shows as “[picture]”) and formula-based conditional formats are not shown. Save the workbook in Excel so every formula has a calculated value; hidden sheets are not shown but stay in the download, so remove personal data (student numbers, emails, file paths) from them too. The original file is offered for download.
- **JSX**: one file that default-exports a React component.
  - Imports are limited to `react`, `react-dom`, `recharts` and files inside the package: `.js`, `.jsx` and `.json` modules, images (imported as data URLs) and `.csv` or `.txt` files (imported as text).
  - The default export may be a function or class component, or a `memo`/`forwardRef` component.
  - Use inline styles. CSS imports are not supported.
  - The artifact runs in a sandbox with no network access, no browser storage and no access to the page around it. External fonts, images and APIs do not load.

## Checking and importing

```bash
npm run publication:add -- ./incoming/2026-09-28-european-banking-outlook.zip
```

The importer checks the package, adds `format` when the primary file makes it obvious, and copies the package to its place. It never asks where the package belongs. An unknown `related` or `<PublicationRef>` ID is only a warning at import, because the other publication may be imported next; import it before you commit, or validation fails. To update a published package, import it again with `--replace`.

```bash
npm run publication:validate
```

Validation fails on: invalid YAML or manifest fields, a bad or duplicate ID, a missing primary file or wrong extension, an MDX error, an unknown component or prop, an undefined citation, a missing or outside-the-package asset, an unknown `related` or `<PublicationRef>` ID, chart columns that do not exist, annotations or table roles that name unknown values, a `pdf` that is missing, not a PDF, or set on a package that is not a research report, and a JSX artifact that does not build.
