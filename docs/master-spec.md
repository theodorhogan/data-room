# Tido’s Data Room: master spec for research agents

You produce publications for Tido’s Data Room (https://theodorhogan.github.io/data-room/), a research website. Each publication is one **package**: a folder of content files plus a `manifest.yaml`. The site does everything visual: layout, colours, type, exhibit numbering, the table of contents, search, phone layout and the A4 PDF. You decide **what** to say and **which exhibit** shows it. Your headings also decide whether the table of contents fits beside the text (section 2).

Part 1 is the framework. Read it before you start. Part 2 is the exact package format. Look things up there while you build.

---

# Part 1: Framework

## 1. Choose the output type

Choose by what the task produces, not by its topic.

| The task produces | Publish as | Primary file |
| --- | --- | --- |
| Written analysis backed by evidence: company initiation or update, earnings note, event analysis, macro or thematic study, sector primer, data brief | `research` + `mdx` | `index.mdx` |
| A finished research document that already exists as a PDF (paper, broker note, the authors' own layout) | `research` + `pdf` | `<name>.pdf` |
| Any other finished document (fact sheet, slides, term sheet) | `artifact` + `pdf` | `<name>.pdf` |
| A model or dataset that readers open and inspect: DCF, LBO, comps, scenario model, trading book, data tables | `artifact` + `xlsx` | `<name>.xlsx` |
| Something the reader operates: dashboard, calculator, simulator, explorer | `artifact` + `jsx` | `<name>.jsx` |

- One package is one publication. A report and the model behind it are two packages. Link them in both directions with `related`, and point to the model from the text with `<PublicationRef>`.
- An MDX report can also ship the authors' original PDF (manifest `pdf`). Readers then download that PDF instead of the generated A4 print.
- The site cannot host HTML pages, video or audio, live data feeds, external embeds or macros. For live data, publish a dated snapshot. For interactivity, build a JSX artifact with its data inside the package.

## 2. Structure a research report

Open with the conclusion. Use `##` for sections and `###` for subsections; the table of contents is built from them. A heading states the section's finding, not its topic: "Energy, not wages, drives inflation", not "Inflation".

Keep the table of contents within **22 lines**. On a desktop, it sits in a narrow column beside the text. It stays pinned there, with only the current section's `###` headings open, as long as the whole list fits in the reader's window. If it does not fit, it scrolls away with the page and shows every `###` heading at once. Count its lines like this:

- A `##` heading takes one line for every 36 characters, rounded up. A `###` heading takes one line for every 32 characters.
- Add up the lines of all `##` headings, one line for the References entry that the site adds, and the lines of the `###` headings in the section that has the most.

Within 22 lines, the table of contents stays pinned in a window as small as 1280×720. One-line headings are the easiest way to stay within the limit: put the detail in the section's first sentence, not in its heading. In an appendix, give each table a `title` instead of its own `###` heading.

Start from the closest archetype and adapt it. The section names below are roles, not headings: write each heading as its finding ("Bottom line: a hedge, not an exit"). Only `## Sources and method` keeps its name. `<KeyFigures>` and one opening `<Callout>` may come before the first heading.

| Archetype | Sections (`##`) | Signature elements | Tags |
| --- | --- | --- | --- |
| **Equity initiation / company deep dive** (20–60 exhibits) | Investment summary · Business · Industry and competition · Financial analysis · Forecast · Valuation · Risks · ESG (optional) · Appendix | `<KeyFigures>` at the top (rating, target, price, upside, market cap); football field (`range`, horizontal); bull/base/bear `<Callout>`s; statement tables with `forecast` columns in the appendix | Equity Research, Deep Research, plus DCF / CCA / LBO / CTA as used |
| **Company update / earnings note** (3–8 exhibits) | Bottom line · What happened · What changes in our view · Estimates and valuation · Catalysts and risks | `<KeyFigures>`; results-versus-expectations table with `changes`; estimate-revision table | Equity Research, Report |
| **Event / news analysis** (5–12 exhibits) | Bottom line · Fact check · Timeline · Mechanics · Implications · Historical parallels · Scenarios and signposts · Catalyst calendar | Mermaid timeline; chart with an event `line`; parallels table; catalyst table | Deep Research, plus the topic tag |
| **Macro / thematic study** (10–20 exhibits) | Bottom line · The move · one section per driver · Spillovers · Consequences · Historical analogues · Outlook and scenarios | Line charts with regime `band`s and a `forecast` period; analogue table | Macro, Deep Research |
| **Sector or topic primer** (6–15 exhibits) | Bottom line · How the industry works · Size and growth · Players and positioning · Economics · Drivers and risks · What to watch | Mermaid value chain; positioning scatter; ranking bars; comps table | Report, plus Equity Research or Macro |
| **Data brief** (2–6 exhibits) | Bottom line · one section per finding | One exhibit per finding | Report, plus the topic tag |

End every report with `## Sources and method`: the data used, the data cut-off date, and how estimates were made. Add a disclaimer section if the authors require one. Put long tables and full statements in an appendix.

## 3. Exhibits: the design choices you make

You never set colours, fonts or sizes. You choose the exhibit, the claim it makes and what it emphasises. The site renders that in the house style on screen, on phones and in the PDF.

- **One exhibit, one message.** `title` states the finding as a sentence ("Backlog up 46% in a year"). `yLabel` (charts) or `unit` (tables) names the measure and its unit. Every data exhibit has `sources`. `caption` holds definitions, adjustments and notes on estimates.
- **One emphasis.** Use at most one `highlight` per exhibit: the bar, series, row or point that the title is about. Put context into annotations: a `forecast` period, regime `band`s, a `line` for an event date or a target level, one `note`.
- **Colour carries meaning and is applied for you.** Levels are navy. Green and red appear only for changes (`measure="change"`, table `changes`). Lilac marks the one highlight. Do not try to encode meaning any other way.
- **Keep it legible.** A chart has at most 4 series: group the rest as "Other" or split the chart. Keep category names and annotation labels short (a word or two), because they wrap or are cut on phones. A table with more than 10 columns prints in small type, so split it by period or move it to the appendix.
- **Units in tables.** `unit` holds what all cells share. When units differ by row (an earnings table), put each row's unit in its label: `Revenue ($m)`, `Gross margin (%)`.
- **Sources show by publisher.** The source line under an exhibit shows each reference's `publisher`, so make publishers specific enough to tell two sources apart.

Choose the exhibit by the question it answers:

| Question | Exhibit |
| --- | --- |
| How did it move over time? | `<Chart type="line">` with dates on x; `point` for a few irregular observations; `scale="log"` across orders of magnitude |
| How do items compare or rank? | `<Chart type="bar">`, sorted; `orientation="horizontal"` for many items or long names |
| What is it made of, and how does the mix change? | `bar` with `stacked="true"` |
| What rose and what fell? (growth, surprises, revisions) | `bar` with `measure="change"` |
| Where does the value lie? (valuation, guidance against actual, trading range) | `type="range"`; horizontal gives a football field |
| How do two measures relate? (positioning, valuation against growth) | `type="scatter"` with `label`, optionally `size` |
| What are the exact numbers? (statements, comps, scenarios, calendars) | `<Table>` with the roles `key`, `changes`, `forecast`, `highlight` |
| How does it work or unfold? (process, structure, causality, sequence) | `<Mermaid>` flowchart or timeline |
| What are the headline numbers? | `<KeyFigures>` at the top, at most 8 rows |
| Is a picture needed? (map, product, schematic you may publish) | `<Figure>` |
| Is this an aside, a scenario or a caveat? | `<Callout>`: `note` for context or a scenario, `important` for the number the thesis depends on, `warning` for a risk or caveat. Use them sparingly. |

In deep research, use roughly one exhibit for every two to four paragraphs. A claim that rests on a series of numbers gets an exhibit, not a paragraph of figures.

## 4. Writing

- Write the conclusion first, then the evidence, then the implications and what would change the view.
- Write plain, precise English in short paragraphs. Define each abbreviation once.
- Give every number a unit and a date or period. Mark estimates (`2027E`) and keep actuals apart from forecasts.
- Cite every fact that is not common knowledge with `<Cite>` right after the claim, before the full stop, using the primary source where one exists.
- State ratings, targets and scenario probabilities as the authors' view, and show the reasoning behind them.
- Manifest `summary`: one short sentence on what the publication finds or contains. Use few tags.

## 5. Data, sources and rights

- **One tidy CSV per exhibit.** The header row holds names a reader understands (`Revenue ($m)`, not `rev_usd_m`), because readers see them in tables and can download the file. Write plain numbers, without thousands separators, `%` or currency signs. Use a minus sign for negatives, ISO dates (`2026-09-25` or `2026-09`) and an empty cell for a missing value.
- **Several series go in long format:** one row per x value and series, with a `series` column (`Date,Series,Value`).
- **Decimals.** A table shows each column with fixed decimals. In a table organised by rows (revenue, margin, EPS…), write every number of a row with the same decimals (`486.3,452.0,7.6`); the table then keeps each row's decimals.
- **Key figures are display text,** not data: write them as readers should see them (`Target price,$62`, `Rating,Outperform`).
- **Readers can download every file in the package.** Publish only data you may redistribute. Prefer primary public sources: filings, central banks, statistics offices, exchanges. From licensed terminals (FactSet, Bloomberg, LSEG, S&P Capital IQ), publish only derived or aggregated figures with credit, never raw exports.
- **No personal data in any file.** People appear only as credited authors. Remove student numbers, email addresses, phone numbers and local file paths, including from document properties, comments, hidden sheets and PDF metadata.
- **Dates.** The manifest `date` is the publication date. Give the data cut-off date in Sources and method.

## 6. Required outputs

Deliver **one ZIP or folder named `<id>` that holds exactly one package**. In your reply, outside the package, add a short handoff note: what the publication is, the data cut-off date, anything you could not verify, and the IDs of related packages.

| Format | The package contains |
| --- | --- |
| `mdx` | `manifest.yaml`, `index.mdx`, `references.yaml`, and every file the report uses (`*.csv`, `*.mmd`, images). Optionally `key-figures.csv`, and the authors' PDF named in `pdf`. |
| `pdf` | `manifest.yaml` and the PDF: a real PDF whose metadata has a meaningful Title. |
| `xlsx` | `manifest.yaml` and the workbook: saved in Excel so every formula has a value; no macros and no external links; inputs, calculations and outputs on clearly named sheets; the cover or summary sheet active when saved; personal data removed, including from hidden sheets and file properties. |
| `jsx` | `manifest.yaml`, the `.jsx` file (it default-exports a React component) and its data files. Self-contained: no network, no external fonts, inline styles only. It must work from 360 px wide. |

The package is done when:

- [ ] the output type fits the task (section 1), and a report follows an archetype (section 2)
- [ ] every exhibit has a finding as its title, a unit and sources, at most one highlight and at most 4 series
- [ ] every `<Cite>` and `sources` ID is in `references.yaml`, and every referenced file exists with exactly that name and case
- [ ] the manifest has a valid ID and date, a one-sentence summary and a few tags from the list, plus `authors`, `tickers` and `related` where they apply
- [ ] the package holds no personal data, and only data you may redistribute
- [ ] the table of contents is within 22 lines, counted as in section 2
- [ ] with access to the repository: `npm run publication:add -- <zip>` passes, and the page looks right in `npm run dev` on a desktop and at phone width. On the desktop, scroll from top to bottom: the table of contents must stay pinned beside the text and open the `###` headings of each section in turn

---

# Part 2: Package reference

## Package

One publication is one folder:

```text
2026-09-28-european-banking-outlook/
  manifest.yaml        required: metadata
  index.mdx            the primary file (here: a research report)
  references.yaml      research only: the sources you cite
  chart-01.csv         internal assets used by this publication only
  diagram-01.mmd
```

- Send the folder as it is, or as a ZIP of it. The ZIP must contain exactly one package, either as the `<id>/` folder or as its files at the top level.
- Keep files next to the manifest. File names use only letters, digits, `.`, `_` and `-`, and start with a letter or digit.
- Names are case-sensitive. On Windows and macOS, change only the case of a file name with `git mv old.csv Old.csv`; git does not pick up a rename in Explorer or Finder, and the build then fails on Linux.
- In a research report package, `<id>.pdf` is reserved for the generated PDF, unless the manifest names it as the report's own `pdf`.
- Allowed file types: `.yaml .mdx .csv .json .mmd .txt .svg .png .jpg .jpeg .gif .webp .avif .pdf .xlsx`, plus `.jsx .js` in JSX artifact packages. HTML files are not allowed. An SVG must not contain scripts, event handlers or embedded HTML. Only the primary file may be `.mdx`.
- An internal asset is a file that only this publication needs, such as a chart's CSV. Anything a reader could use on its own is a separate package: an Excel model, a dataset, a PDF, an interactive tool, another report. The one exception is a research report's own PDF (see `pdf` below).
- Do not include colours, fonts, layout or CSS.

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
- `authors` lists the people credited for the work, as the requester names them. Do not invent authors.
- `tags` come from a fixed list: Deep Research, Macro, Financial Model, DCF, CCA, LBO, CTA (comparable transactions), Trading, Report, Equity Research. Write the label or its lowercase-hyphenated form (`deep-research`). Tags become the library's topic filters. The newest Deep Research publication is featured at the top of the library.
- `tickers` are stock symbols of the public companies the publication is mainly about: `PRLB`, `BRK.B`, or with an exchange suffix outside the US (`RNO.PA`, `KGX.DE`). They become the library's company filter.
- `pdf` (MDX research reports only) names a PDF in the package, such as the authors' original layout. The download button offers it, and no A4 PDF is generated for this report.
- No other fields are allowed.

| kind + format | Shown as |
| --- | --- |
| `research` + `mdx` | Research report, with an A4 PDF generated from the same source (or the report's own PDF, see `pdf`) |
| `research` + `pdf` | A research paper published as a PDF |
| `artifact` + `pdf` | A PDF document |
| `artifact` + `xlsx` | A read-only workbook (no macros; `.xlsm` is not accepted) |
| `artifact` + `jsx` | An interactive artifact |

## Research reports (MDX)

Write ordinary Markdown: headings, paragraphs, lists, tables, emphasis and links. A `# Title` may only be the first line, and it is dropped because the title comes from the manifest. `##` and `###` headings build the table of contents; keep it within the 22-line limit in section 2. Links go to `http`, `https` or `mailto` addresses, to `#headings`, or to files in the package. Link other publications with `<PublicationRef>`, never with a site path such as `/research/…`.

Besides Markdown, only these components exist. Every prop is a quoted string.

| Component | Props | Use |
| --- | --- | --- |
| `<Cite id="…" />` | `id` | Cite a source from `references.yaml`. Numbers follow first appearance. Adjacent citations merge into one marker. |
| `<PublicationRef id="…" />` | `id`, `label` | Link another publication by ID. On its own line it renders as a card; inside a sentence it renders as a link. |
| `<Chart … />` | `src`, `type`, `title` (required); `x`, `y`, `series`, `yLabel`, `caption`, `sources`, `orientation`, `highlight`, `stacked`, `scale`, `measure`, `low`, `high`, `label`, `size`, `annotations` | Chart from a CSV or JSON file. |
| `<Table … />` | `src`, `title` (required); `unit`, `caption`, `sources`, `highlight`, `key`, `changes`, `forecast` | Data table from a CSV or JSON file. |
| `<KeyFigures src="…" />` | `src` (required); `title` | The key-figure panel (rating, target, price…) from a CSV whose header row is `label,value` or `label,value,note` (lowercase), at most 8 rows. Values are shown as written. Not an exhibit. |
| `<Figure … />` | `src`, `alt` (required); `title`, `caption`, `sources` | SVG, PNG, JPEG, WebP, GIF or AVIF image. |
| `<Mermaid … />` | `src` (required); `title`, `caption`, `sources` | Diagram from a `.mmd` file. |
| `<Callout type="note">…</Callout>` | `type` (`note`, `important`, `warning`), `title` | Boxed note. Takes Markdown content. |

Not allowed: frontmatter (`---` blocks), `import`/`export`, `{expressions}`, other components, HTML elements (except `<br />`, `<sup>` and `<sub>`), `style` or `class` attributes, Markdown images (use `<Figure>`), and `#` headings after the first line.

Charts, tables, figures and diagrams are numbered "Exhibit 1, 2, …" automatically. `src` names a file in the package (`chart-01.csv` or `./chart-01.csv`). `sources` is a space-separated list of citation IDs; they appear under the exhibit and in the references.

### Chart data

- `type`: `bar`, `line`, `point`, `range` or `scatter`. `orientation="horizontal"` gives horizontal bars, and for ranges a football field.
- On a phone, vertical bars or ranges with named categories (not years or quarters) are drawn horizontally when their names would not fit under the bars. Stacked bars and charts with bands or markers stay upright.
- `x` and `y` name columns (default: the first two). `series` names a column that splits rows into up to four series.
- The first row holds unique, non-empty column names.
- `y` values must be numbers; leave a cell empty for a gap. Write negative numbers with a minus sign.
- For `line` and `point`, an `x` column of real dates (`2026-09-25` or `2026-09`) gives a time axis.
- `highlight` names what to emphasise: one x value or series (bars), one series (lines and points), one x value (ranges) or one point label (scatter).
- `measure="change"` marks values as changes: labels carry + and −, and a single series shows gains and losses in the signal colours. `measure="level"` never uses signal colours, so a margin that dips below zero stays navy. Without `measure`, a chart with any negative value is read as changes.
- `stacked="true"` stacks the series of a vertical bar chart (values of zero or more). `scale="log"` gives a line or point chart a logarithmic axis (values above zero).
- `type="range"` draws one bar from `low` to `high` per `x` value, with an optional point from `y` (for example a guidance range against the result).
- `type="scatter"` plots numeric `x` against numeric `y`; `label` names each point and `size` scales its area.
- In a data file, a column named `source_id` or `source_ids` holds space-separated citation IDs for that row. Each must exist in `references.yaml`; they render as links to the references.

### Chart annotations

`annotations="./exhibit-03-notes.csv"` adds marks from a CSV with the columns `kind,from,to,value,label` and an optional `series`; leave cells empty where a kind does not use them. `from` and `to` are x values of the chart: categories, or dates within the chart's date range. A forecast starts `from` the first estimated period. On a chart with several series, `series` says which one a note points at. On a scatter chart, a note's `from` is a point label. On a log scale, `value` must be above zero.

| kind | Draws | Limit |
| --- | --- | --- |
| `band` | A quiet background band from `from` to `to`, labelled at the top (eras, regimes) | any |
| `highlight` | The highlighted period: a lilac band with its label | one |
| `forecast` | The forecast period from `from` (to `to` or the end), labelled FORECAST or `label` | one |
| `note` | One pointer: a ring on the value at `from` (or at `value`), a leader line and a short `label` (under 40 characters) | one |
| `line` | With `value`: a dashed reference line at that level (price, target, average). With `from` instead: a dashed marker at that x value (an event date). `label` names it; without one, a level line prints its value | any |

Bands, the highlighted period and the forecast need categories or dates along the horizontal axis. A note needs a value at `from` (or its own `value`).

### Table roles

A row is named by the text of its first cell, a column by its header. Separate several names with `|`.

- `highlight`: the one row that must stand out.
- `key`: rows of key values, set in a heavier weight.
- `changes`: columns or rows of changes, shown with + and − in the signal colours.
- `forecast`: columns of estimates, shaded as a forecast period.

Numbers keep fixed decimals per column. A table organised by rows (revenue, growth, EPS…) keeps the decimals of each row instead.

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

Mermaid diagrams render in the site's colours and fonts, so `%%{init}%%` and other configuration blocks, `style`, `classDef`, `linkStyle` and inline `style=` attributes are not allowed. A diagram's own `title` line is replaced by the exhibit title when `<Mermaid>` has one. A left-to-right timeline or flowchart that is too wide for the reading column is laid out top to bottom.

## Artifacts

- **PDF**: the file must be a real PDF. It is shown inline and offered for download.
- **XLSX**: the viewer shows every visible sheet with the values last calculated in Excel, the formulas, and the workbook's formatting: fills, fonts, borders, colour scales and simple value rules. Grouped rows and columns are shown expanded, and the viewer opens on the sheet that was active when the workbook was saved. Nothing is recalculated or executed. Charts, images (a picture placed in a cell shows as "[picture]") and formula-based conditional formats are not shown. Hidden sheets are not shown but stay in the download. The original file is offered for download.
- **JSX**: one file that default-exports a React component.
  - Imports are limited to `react`, `react-dom`, `recharts` and files inside the package: `.js`, `.jsx` and `.json` modules, images (imported as data URLs) and `.csv` or `.txt` files (imported as text).
  - The default export may be a function or class component, or a `memo`/`forwardRef` component.
  - Use inline styles. CSS imports are not supported.
  - The artifact runs in a sandbox with no network access, no browser storage and no access to the page around it. External fonts, images and APIs do not load.

## Checking and importing

```bash
npm run publication:add -- ./incoming/2026-09-28-european-banking-outlook.zip
```

The importer checks the package, adds `format` when the primary file makes it obvious, and copies the package to `content/<id>/`. An unknown `related` or `<PublicationRef>` ID is only a warning at import, because the other publication may be imported next. Import it before you commit, or validation fails. To update a published package, import it again with `--replace`.

```bash
npm run publication:validate
```

Validation fails with a clear message on any rule in this spec. Manifest errors are reported first; the rest is checked once the manifest is valid. Typical failures:

- invalid YAML or manifest fields, or a bad or duplicate ID
- a missing primary file or a wrong extension
- an MDX error, or an unknown component or prop
- an undefined citation
- a missing asset, or one outside the package
- an unknown `related` or `<PublicationRef>` ID
- chart columns that do not exist, more than 4 series, or more than one highlight
- annotations or table roles that name unknown values
- more than 8 key figures, or a key-figures file without a `label` column
- a `#` heading after the first line
- a `pdf` that is missing, is not a PDF, or is set on a package that is not an MDX research report
- a JSX artifact that does not build
