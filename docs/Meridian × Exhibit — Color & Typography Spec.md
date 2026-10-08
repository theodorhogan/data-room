# Meridian × Exhibit — Color & Typography Spec

Sep 28, 2026 · @tdawg

## Overview

The identity pairs the **Meridian** palette (one navy at five depths, plus a small signal layer) with **Exhibit** typography (Archivo, one variable family). The research leads; color and type stay quiet until a number needs attention.

Three principles govern every decision below:

- **Navy is structure, signals are meaning.** The navy ramp carries headings, rules and data series. Green, crimson, amethyst and copper appear only where a number or a point needs them.
- **One of each per exhibit.** At most one amethyst highlight and one copper mark per chart or table. If everything is emphasized, nothing is.
- **Color never works alone.** Signs (+/−), labels and lightness differences carry the meaning; color confirms it.

This spec covers color and typography only. Logos, layout grids, spacing and page templates are out of scope. The canvas boards *Meridian × Exhibit · Palette* and *· In use* are the visual reference for everything here.

## Color tokens

Twenty-two light-mode values in four groups. Token names are the ones used in the implementation section.

### Navy ramp — structure and data series

| Token | Name | Hex | Role |
| --- | --- | --- | --- |
| `navy-900` | Midnight | #0F1E36 | Primary. Titles, headings, table rules, series 1, cover bands |
| `navy-700` | Meridian | #274C77 | Secondary. Kickers, section numbers, series 2 |
| `navy-500` | Harbour | #5C7EA3 | Series 3. Not for text |
| `navy-300` | Haze | #9BB2CB | Series 4, context data, labels on Midnight |
| `navy-100` | Ice | #D2DDE8 | Quiet bands, zebra rows, forecast shading. Not a highlight |

### Neutrals — paper and ink

| Token | Name | Hex | Role |
| --- | --- | --- | --- |
| `paper` | Cool White | #F5F7FA | Page ground |
| `mist` | Mist | #E6EBF1 | Panels, forecast bands, reference boxes |
| `rule` | Rule | #CBD3DD | Section rules, swatch borders |
| `grid` | Grid | #DCE2E9 | Chart gridlines, table row dividers |
| `slate` | Slate | #5A6573 | Captions, sources, axis labels, secondary text |
| `ink-soft` | Ink Soft | #3A4452 | Standfirst, footnotes |
| `ink` | Ink | #121821 | Body text, numbers, zero lines |

### Signal layer — meaning

| Token | Name | Hex | Role |
| --- | --- | --- | --- |
| `positive` | Pine | #1E7A55 | Positive figures, gain bars |
| `positive-strong-fill` | Pine 2 | #9FD1B7 | Heat map, strong positive |
| `positive-fill` | Pine 1 | #DDEFE5 | Heat map, mild positive; cell fill |
| `negative` | Crimson | #B4233C | Negative figures, loss bars |
| `negative-strong-fill` | Crimson 2 | #E7A3AE | Heat map, strong negative |
| `negative-fill` | Crimson 1 | #F7DEE2 | Heat map, mild negative; cell fill |
| `highlight` | Amethyst | #5B3FA0 | Focus bar or series, highlight label |
| `highlight-fill` | Lilac | #D9CCF2 | Highlighted table row, marked text |
| `highlight-wash` | Lilac Wash | #ECE6F8 | Highlighted period in a chart |
| `accent` | Copper | #A5502A | Annotation lines and pointers, cover signature square |

Two text colors used only inside the signal layer: `highlight-ink` #3E2A74 for text set on Lilac when it must read as highlighted, and pure white #FFFFFF for text on solid Pine, Crimson, Amethyst or Copper blocks.

## Color usage rules

A typical text-and-exhibit page is about 60% paper, 10% mist, 11% ink, 8% Midnight, 5% Meridian, 5% lighter ramp steps and under 1% copper. Covers may use more Midnight; body pages should stay close to these proportions.

1. **Sign first.** Every change, delta or return prints its sign: +0.38, −0.07 (use the true minus sign U+2212, not a hyphen). Pine and Crimson confirm the sign; they never replace it.
2. **Signal colors are for numbers and marks only.** Never use Pine, Crimson, Amethyst or Copper for headings, body text, covers or large backgrounds.
3. **Level values stay ink.** Color only changes and deltas (Δ columns, returns, spreads). A yield of 4.31 is ink; its 12-month change of +0.38 is Pine.
4. **One Amethyst highlight per exhibit.** One focus bar, series, row or period. Amethyst colors the data that matters.
5. **One Copper mark per exhibit.** A circle, pointer line or short label that points at the data. Copper never colors a number or a fill, so it cannot be mistaken for Crimson.
6. **Ice is not a highlight.** Use it for zebra rows and quiet bands; use Lilac when a row must stand out.
7. **Series follow the ramp in order.** Midnight, Meridian, Harbour, Haze. More than four series: group the rest as "Other" in Haze, or split the chart.
8. **Heat maps use two steps each way.** Strong fill at |value| ≥ 2.0, mild fill from 0.5 to 2.0, white within ±0.5. Thresholds are set per exhibit and stated in its legend; text in cells stays ink.

## Dark mode

For screen publishing, each token has a dark counterpart under the same name, so components switch by theme without per-color logic. The data ramp reverses: the lightest navy leads, because on a dark ground brightness carries rank.

| Token | Light | Dark | Note |
| --- | --- | --- | --- |
| `paper` | #F5F7FA | #0B1526 | Page ground |
| `mist` | #E6EBF1 | #14223A | Panels, forecast bands |
| `rule` | #CBD3DD | #2A3A55 | Section rules |
| `grid` | #DCE2E9 | #1E2D47 | Gridlines, row dividers |
| `ink` | #121821 | #F5F7FA | Body text |
| `ink-soft` | #3A4452 | #C3D0DE | Standfirst, footnotes |
| `slate` | #5A6573 | #9BB2CB | Captions, sources, axes |
| `navy-900` (headings) | #0F1E36 | #F5F7FA | Headings go to near-white |
| `navy-700` (kickers) | #274C77 | #7FA3CC | Kickers, section numbers |
| Series 1 | #0F1E36 | #B7C9DD |  |
| Series 2 | #274C77 | #7FA3CC |  |
| Series 3 | #5C7EA3 | #5C7EA3 | Unchanged |
| Series 4 | #9BB2CB | #3E5A7E | Context |
| `positive` | #1E7A55 | #6FC39A |  |
| `positive-fill` | #DDEFE5 | #173A2E |  |
| `negative` | #B4233C | #F07A8A |  |
| `negative-fill` | #F7DEE2 | #4A1A24 |  |
| `highlight` | #5B3FA0 | #B9A4EE |  |
| `highlight-fill` | #D9CCF2 | #3A2E63 |  |
| `highlight-wash` | #ECE6F8 | #231D42 |  |
| `accent` | #A5502A | #E07A4A |  |

The strong heat-map fills keep their light values in dark mode with ink #121821 text in the cell. Midnight cover panels in light mode (such as a key-figure box) use the dark column for everything inside them.

## Typography setup

One family does everything: **Archivo** (Omnibus-Type), a variable grotesque with a width axis. The width axis is the system's signature: expanded for kickers, normal for reading, condensed for tables and charts.

| Property | Value |
| --- | --- |
| Family | Archivo, roman and italic |
| Axes | Width `wdth` 62–125, weight `wght` 100–900 |
| Licence | SIL Open Font License 1.1: free for web, print and app use; may be self-hosted and bundled |
| Source | Google Fonts, or the Omnibus-Type release for self-hosting |
| Fallback stack | `'Archivo', 'Helvetica Neue', Arial, sans-serif` |

**Loading.** Self-host the variable woff2 files (roman and italic) rather than calling Google's servers. It is faster, works offline and avoids the EU privacy issue of sending reader IP addresses to Google. Use `font-display: swap` and declare the ranges so the browser maps `font-stretch` to the width axis:

```css
@font-face {
  font-family: 'Archivo';
  src: url('/fonts/Archivo-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-stretch: 62% 125%;
  font-style: normal;
  font-display: swap;
}
```

**Width in CSS.** Set width with `font-stretch` (percent), weight with `font-weight`. Use `font-variation-settings` only as a fallback where `font-stretch` is not mapped.

**Figures.** Tables, charts and any aligned number use `font-variant-numeric: tabular-nums`. Before launch, check that the served font build includes the `tnum` feature by setting a column of 1s over a column of 0s; if widths differ, the build is missing it.

## Type scale by role

All sizes are taken from the *Meridian × Exhibit · In use* board and are the desktop values. Width is `font-stretch`; letter-spacing is in em. On screens under 640px, scale only the four largest roles, using the mobile column.

| Role | Size / line height | Weight | Width | Tracking | Color token | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Masthead / display | 64px / 1.0 | 300 | 100% | −0.03 | `navy-900` | 40px |
| Report title | 56px / 1.04 | 300 | 100% | −0.028 | `navy-900` | 36px |
| Standfirst | 20px / 1.45 | 400 | 100% | 0 | `ink-soft` | 18px |
| Kicker (uppercase) | 12px | 700 | 120% | +0.16 | `navy-700` |  |
| Byline, meta | 13px | 400 | 90% | 0 | `slate` |  |
| Section number | 44px / 1.0 | 200 | 80% | −0.02 | `navy-700` | 32px |
| Section label (uppercase) | 12px | 600 | 115% | +0.12 | `slate` |  |
| Section heading (H2) | 24px / 1.25 | 600 | 100% | −0.01 | `navy-900` |  |
| Body | 17px / 1.6 | 400 | 100% | 0 | `ink` |  |
| Footnote marker | 11px, superscript | 600 | 100% | 0 | `ink` |  |
| Exhibit label (uppercase) | 11px | 600 | 115% | +0.12 | `slate` |  |
| Exhibit title (action title) | 17px / 1.3 | 600 | 100% | −0.005 | `navy-900` |  |
| Exhibit unit line | 12px | 400 | 90% | 0 | `slate` |  |
| Axis and tick labels | 11px | 400 | 85% | 0 | `slate` |  |
| Data labels in charts | 12px | 700 | 85% | 0 | series or signal color |  |
| Table header | 12px | 600 | 85% | 0 | `ink` |  |
| Table body | 14px | 400 (600 for key values) | 85% | 0 | `ink` or signal |  |
| Source line | 12px | 400 | 90% | 0 | `slate` |  |
| Footnotes | 13px / 1.5 | 400 | 95% | 0 | `ink-soft` |  |

**Measure.** Body text runs to a maximum of 640px, about 70 characters per line. Titles run to 860px and use `text-wrap: balance`; body paragraphs use `text-wrap: pretty`.

**Action titles.** Exhibit titles state the finding as a sentence ("The UK carries the widest premium"), not the chart's subject. The unit line underneath names the measure and units.

**What not to do.** No bold titles (titles are Light 300), no condensed widths in body text, no positive letter-spacing on lowercase text, and no weights outside 200–700.

## Charts and tables

Every exhibit has the same header stack, top to bottom: exhibit label ("Exhibit 2"), action title, unit line. The source line sits directly under the chart or table.

### Charts

| Element | Spec |
| --- | --- |
| Series colors | `navy-900`, `navy-700`, `navy-500`, `navy-300`, in that order. Lines 2px; the lead series 2.5px |
| Signed bars | Positive bars `positive`, negative bars `negative`, measured from an `ink` zero line (1px) |
| Highlight | One element in `highlight`: the latest bar, the focus series or the key point. Its data label is also `highlight` |
| Highlighted period | A `highlight-wash` band behind the data, with an 11px uppercase label in `highlight` |
| Forecast period | A `mist` band behind the data, labelled "FORECAST" in `slate` |
| Annotation | One `accent` (copper) mark: a 6px-radius ring with a 2px stroke, a 1px leader line and a 12px/700 label |
| Gridlines | `grid`, 1px, horizontal only. No vertical gridlines, no chart border, no background fill |
| Axes | Tick labels only, 11px `slate`, condensed 85%. Units live in the unit line, not on the axis |
| Legend | Only when direct labels will not fit. Label lines at their right-hand end where possible |

### Tables

| Element | Spec |
| --- | --- |
| Top rule | 2px `navy-900` |
| Header row | 12px/600, bottom rule 1px `navy-900`; numbers right-aligned under right-aligned headers |
| Row dividers | 1px `grid` |
| Bottom rule | 1px `navy-900` |
| Cell padding | 7px vertical, 4px horizontal |
| Numbers | Tabular, right-aligned, condensed 85%, fixed decimals per column |
| Changes and deltas | `positive` or `negative` text, always signed |
| Key value | Weight 600 in `ink`; the single most important value 700 |
| Highlighted row | `highlight-fill` background across the full row, row label 600 |
| Zebra striping | Optional, `navy-100` (Ice), only for tables over 12 rows |
| Heat maps | `positive-fill` / `positive-strong-fill` and `negative-fill` / `negative-strong-fill`, 3px gaps between cells, with a legend giving the thresholds |

## Accessibility

Every text pairing in this spec meets WCAG AA (4.5:1 for normal text) except the two marked below, which are restricted to non-text use. Ratios are computed against the ground they sit on.

| Text color | On | Ratio | Status |
| --- | --- | --- | --- |
| `ink` #121821 | `paper` | 16.6:1 | Pass |
| `navy-900` #0F1E36 | `paper` | 15.5:1 | Pass |
| `ink-soft` #3A4452 | `paper` | 9.2:1 | Pass |
| `navy-700` #274C77 | `paper` | 8.2:1 | Pass |
| `highlight` #5B3FA0 | `paper` | 7.4:1 | Pass |
| `negative` #B4233C | `paper` | 6.0:1 | Pass |
| `slate` #5A6573 | `paper` | 5.5:1 | Pass |
| `accent` #A5502A | `paper` | 5.2:1 | Pass |
| `positive` #1E7A55 | `paper` | 4.9:1 | Pass |
| `slate` #5A6573 | `mist` | 4.9:1 | Pass |
| `ink` #121821 | `highlight-fill` | 11.8:1 | Pass |
| `highlight-ink` #3E2A74 | `highlight-fill` | 7.8:1 | Pass |
| `ink` #121821 | `negative-strong-fill` | 8.7:1 | Pass |
| White | `positive` / `negative` / `highlight` / `accent` blocks | 5.3 / 6.5 / 7.9 / 5.6:1 | Pass |
| `navy-300` #9BB2CB | `navy-900` panel | 7.6:1 | Pass |
| `navy-500` #5C7EA3 | `paper` | 3.9:1 | Lines and bars only, never text |
| `navy-300` #9BB2CB | `paper` | below 3:1 | Lines and bars only, never text |

In dark mode, all text tokens pass at 6.1:1 or higher on #0B1526.

Pine and Crimson have similar lightness, so readers with red-green color blindness may not tell them apart by color. That is why the sign rule is mandatory. Series are distinguished by lightness steps in the ramp, not by hue.

## Implementation tokens

Copy these as the single source of truth. Components reference the semantic tokens, never raw hex values, so the dark theme works by swapping one block.

```css
:root {
  /* Navy ramp */
  --navy-900: #0F1E36;  /* Midnight */
  --navy-700: #274C77;  /* Meridian */
  --navy-500: #5C7EA3;  /* Harbour */
  --navy-300: #9BB2CB;  /* Haze */
  --navy-100: #D2DDE8;  /* Ice */

  /* Neutrals */
  --paper: #F5F7FA;
  --mist: #E6EBF1;
  --rule: #CBD3DD;
  --grid: #DCE2E9;
  --slate: #5A6573;
  --ink-soft: #3A4452;
  --ink: #121821;

  /* Signal layer */
  --positive: #1E7A55;
  --positive-fill: #DDEFE5;
  --positive-strong-fill: #9FD1B7;
  --negative: #B4233C;
  --negative-fill: #F7DEE2;
  --negative-strong-fill: #E7A3AE;
  --highlight: #5B3FA0;
  --highlight-fill: #D9CCF2;
  --highlight-wash: #ECE6F8;
  --highlight-ink: #3E2A74;
  --accent: #A5502A;

  /* Roles */
  --text-heading: var(--navy-900);
  --text-kicker: var(--navy-700);
  --series-1: var(--navy-900);
  --series-2: var(--navy-700);
  --series-3: var(--navy-500);
  --series-4: var(--navy-300);

  /* Type */
  --font-sans: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  --width-expanded: 120%;
  --width-label: 115%;
  --width-meta: 90%;
  --width-data: 85%;
}

[data-theme="dark"] {
  --paper: #0B1526;
  --mist: #14223A;
  --rule: #2A3A55;
  --grid: #1E2D47;
  --slate: #9BB2CB;
  --ink-soft: #C3D0DE;
  --ink: #F5F7FA;
  --text-heading: #F5F7FA;
  --text-kicker: #7FA3CC;
  --series-1: #B7C9DD;
  --series-2: #7FA3CC;
  --series-3: #5C7EA3;
  --series-4: #3E5A7E;
  --positive: #6FC39A;
  --positive-fill: #173A2E;
  --negative: #F07A8A;
  --negative-fill: #4A1A24;
  --highlight: #B9A4EE;
  --highlight-fill: #3A2E63;
  --highlight-wash: #231D42;
  --accent: #E07A4A;
}
```

The same values as a design-token file, for Figma Tokens, Style Dictionary or a charting library theme:

```json
{
  "color": {
    "navy": { "900": "#0F1E36", "700": "#274C77", "500": "#5C7EA3", "300": "#9BB2CB", "100": "#D2DDE8" },
    "neutral": { "paper": "#F5F7FA", "mist": "#E6EBF1", "rule": "#CBD3DD", "grid": "#DCE2E9", "slate": "#5A6573", "inkSoft": "#3A4452", "ink": "#121821" },
    "signal": {
      "positive": "#1E7A55", "positiveFill": "#DDEFE5", "positiveStrongFill": "#9FD1B7",
      "negative": "#B4233C", "negativeFill": "#F7DEE2", "negativeStrongFill": "#E7A3AE",
      "highlight": "#5B3FA0", "highlightFill": "#D9CCF2", "highlightWash": "#ECE6F8", "highlightInk": "#3E2A74",
      "accent": "#A5502A"
    },
    "series": ["#0F1E36", "#274C77", "#5C7EA3", "#9BB2CB"]
  },
  "font": {
    "family": "Archivo",
    "width": { "expanded": 120, "label": 115, "normal": 100, "meta": 90, "data": 85, "sectionNumber": 80 },
    "role": {
      "title":        { "size": 56, "lineHeight": 1.04, "weight": 300, "tracking": -0.028 },
      "standfirst":   { "size": 20, "lineHeight": 1.45, "weight": 400 },
      "kicker":       { "size": 12, "weight": 700, "width": 120, "tracking": 0.16, "case": "upper" },
      "h2":           { "size": 24, "lineHeight": 1.25, "weight": 600, "tracking": -0.01 },
      "body":         { "size": 17, "lineHeight": 1.6, "weight": 400, "measure": 640 },
      "exhibitTitle": { "size": 17, "lineHeight": 1.3, "weight": 600, "tracking": -0.005 },
      "tableBody":    { "size": 14, "weight": 400, "width": 85, "numeric": "tabular" },
      "axis":         { "size": 11, "weight": 400, "width": 85 },
      "footnote":     { "size": 13, "lineHeight": 1.5, "weight": 400, "width": 95 }
    }
  }
}
```

Open question for the build team: which charting library will render the exhibits? Its theme should be generated from this token file rather than configured by hand.
