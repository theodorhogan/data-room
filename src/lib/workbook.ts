// Read-only workbook model for the XLSX viewer: values as Excel would display them,
// the author's cell formatting, formulas for inspection. No evaluation, no macros.
import fs from 'node:fs';
import posixpath from 'node:path/posix';
import ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import SSF from 'ssf';

export const MAX_ROWS = 2000;
export const MAX_COLS = 80;

export interface SheetCell {
  text: string;
  address: string;
  formula?: string;
  numeric: boolean;
  style?: string;
  /** Has a fill, so gridlines are hidden under it (as in Excel). */
  filled?: boolean;
  colspan?: number;
  rowspan?: number;
  /** An Excel "picture in cell": the viewer cannot show the image. */
  picture?: boolean;
}
export interface SheetRow {
  index: number;
  height?: number;
  cells: (SheetCell | null)[];
}
export interface SheetColumn {
  letter: string;
  width: number;
}
export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  truncated: boolean;
  formulaCount: number;
}
export interface WorkbookModel {
  sheets: Sheet[];
  hiddenSheets: number;
  /** The sheet that was active when the workbook was saved, if it is visible. */
  activeSheet?: string;
}

const V = ExcelJS.ValueType;

export function columnLetter(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function columnNumber(letters: string): number {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function toSerial(d: Date, date1904: boolean): number {
  return d.getTime() / 86400000 + (date1904 ? 24107 : 25569);
}

function format(fmt: string | undefined, value: number, date1904: boolean): string {
  try {
    return String(SSF.format(fmt || 'General', value, { date1904 })).replace(/\s{2,}/g, ' ');
  } catch {
    return String(value);
  }
}

function cachedValue(cell: ExcelJS.Cell): unknown {
  return cell.type === V.Formula ? cell.result : cell.value;
}

function display(cell: ExcelJS.Cell, date1904: boolean): { text: string; numeric: boolean } {
  const v = cachedValue(cell);
  if (v == null) return { text: '', numeric: false };
  if (typeof v === 'number') return { text: format(cell.numFmt, v, date1904), numeric: true };
  if (v instanceof Date) return { text: format(cell.numFmt || 'yyyy-mm-dd', toSerial(v, date1904), date1904), numeric: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', numeric: false };
  if (typeof v === 'string') return { text: v, numeric: false };
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; error?: string };
    if (o.richText) return { text: o.richText.map((t) => t.text).join(''), numeric: false };
    if (o.error) return { text: o.error, numeric: false };
    if (typeof o.text === 'string') return { text: o.text, numeric: false };
  }
  return { text: String(v), numeric: false };
}

// ---------------------------------------------------------------- colours

/** Office default theme in Excel's theme-index order: lt1, dk1, lt2, dk2, accent1–6, hlink, folHlink. */
const OFFICE_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
const THEME_SLOTS = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
/** Excel's legacy indexed palette (0–63). */
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ');

/** The workbook's own theme colours, read from its theme part. */
function themePalette(wb: ExcelJS.Workbook): string[] {
  const xml = Object.values((wb.model as unknown as { themes?: Record<string, string> }).themes ?? {})[0];
  const scheme = typeof xml === 'string' ? xml.match(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/)?.[0] : undefined;
  if (!scheme) return OFFICE_THEME;
  return THEME_SLOTS.map((slot, i) => {
    const block = scheme.match(new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`))?.[1] ?? '';
    return (block.match(/(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/)?.[1] ?? OFFICE_THEME[i]).toUpperCase();
  });
}

const toRgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Excel's tint: lighten (tint > 0) or darken (tint < 0) in HSL lightness. */
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) return toHex([l, l, l].map((v) => v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return toHex([hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => v * 255));
}

type ColorSpec = { argb?: string; theme?: number; tint?: number; indexed?: number } | undefined;

/** An Excel colour (ARGB, theme + tint, or indexed) as a validated #RRGGBB string. */
function resolveColor(color: ColorSpec, palette: string[]): string | undefined {
  if (!color) return undefined;
  let hex: string | undefined;
  if (typeof color.argb === 'string' && /^[0-9A-F]{8}$/i.test(color.argb)) hex = color.argb.slice(2);
  else if (typeof color.theme === 'number') hex = palette[color.theme];
  else if (typeof color.indexed === 'number') hex = INDEXED[color.indexed];
  if (!hex || !/^[0-9A-F]{6}$/i.test(hex)) return undefined;
  return `#${applyTint(hex.toUpperCase(), Number(color.tint) || 0)}`;
}

// ---------------------------------------------------------------- cell styles

const BORDERS: Record<string, string> = {
  hair: '1px solid',
  thin: '1px solid',
  dotted: '1px dotted',
  dashed: '1px dashed',
  dashDot: '1px dashed',
  dashDotDot: '1px dashed',
  medium: '2px solid',
  mediumDashed: '2px dashed',
  mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed',
  slantDashDot: '2px dashed',
  thick: '3px solid',
  double: '3px double',
};
const BASE_FONT_PX = 13;

interface StyleContext {
  palette: string[];
  /** The sheet's most common font size, rendered at BASE_FONT_PX. */
  baseSize: number;
}
/** CSS declarations for one cell; every value is built from numbers, fixed keywords or validated colours. */
type Css = Map<string, string>;

function cellCss(cell: ExcelJS.Cell, ctx: StyleContext): { css: Css; filled: boolean } {
  const css: Css = new Map();
  const font = cell.font;
  if (font?.bold) css.set('font-weight', '700');
  if (font?.italic) css.set('font-style', 'italic');
  const decoration = [font?.underline && 'underline', font?.strike && 'line-through'].filter(Boolean).join(' ');
  if (decoration) css.set('text-decoration', decoration);
  const color = resolveColor(font?.color as ColorSpec, ctx.palette);
  if (color && color !== '#000000') css.set('color', color);
  const size = Number(font?.size);
  if (size > 0 && size !== ctx.baseSize) css.set('font-size', `${Math.round((BASE_FONT_PX * size * 10) / ctx.baseSize) / 10}px`);

  let filled = false;
  const fill = cell.fill;
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    filled = true;
    const bg = resolveColor(fill.fgColor as ColorSpec, ctx.palette);
    if (bg && bg !== '#FFFFFF') css.set('background', bg);
  }

  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const border = cell.border?.[side];
    const line = border?.style && BORDERS[border.style];
    if (line) css.set(`border-${side}`, `${line} ${resolveColor(border.color as ColorSpec, ctx.palette) ?? '#000000'}`);
  }

  const align = cell.alignment;
  const horizontal = align?.horizontal === 'centerContinuous' ? 'center' : align?.horizontal;
  if (horizontal === 'left' || horizontal === 'center' || horizontal === 'right') css.set('text-align', horizontal);
  if (align?.vertical === 'top' || align?.vertical === 'middle') css.set('vertical-align', align.vertical);
  const indent = Number(align?.indent);
  if (indent > 0) css.set('padding-left', `${4 + Math.min(indent, 15) * 9}px`);
  if (align?.wrapText) css.set('white-space', 'pre-wrap');
  return { css, filled };
}

const serialize = (css: Css) => (css.size ? [...css].map(([k, v]) => `${k}:${v}`).join(';') : undefined);

// ---------------------------------------------------------------- conditional formatting

interface CfRule {
  type: string;
  priority?: number;
  operator?: string;
  formulae?: unknown[];
  cfvo?: { type: string; value?: unknown }[];
  color?: ColorSpec[];
  style?: { fill?: { fgColor?: ColorSpec; bgColor?: ColorSpec }; font?: { color?: ColorSpec; bold?: boolean; italic?: boolean } };
}

/** Cells covered by a reference such as "F44:AA62 F63:U63" or "A:A", clamped to the displayed grid. */
function* refCells(ref: string, rowLimit: number, colLimit: number): Generator<[number, number]> {
  for (const range of ref.split(/\s+/).filter(Boolean)) {
    const [a, b = a] = range.replace(/\$/g, '').split(':');
    const parse = (s: string) => {
      const m = s.match(/^([A-Z]*)(\d*)$/i);
      return { c: m?.[1] ? columnNumber(m[1]) : undefined, r: m?.[2] ? Number(m[2]) : undefined };
    };
    const start = parse(a);
    const end = parse(b);
    const r1 = Math.min(end.r ?? rowLimit, rowLimit);
    const c1 = Math.min(end.c ?? colLimit, colLimit);
    for (let r = start.r ?? 1; r <= r1; r++) for (let c = start.c ?? 1; c <= c1; c++) yield [r, c];
  }
}

function threshold(cfvo: { type: string; value?: unknown }, sorted: number[]): number | undefined {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const value = Number(cfvo.value);
  switch (cfvo.type) {
    case 'min':
      return min;
    case 'max':
      return max;
    case 'num':
      return Number.isFinite(value) ? value : undefined;
    case 'percent':
      return Number.isFinite(value) ? min + ((max - min) * value) / 100 : undefined;
    case 'percentile': {
      if (!Number.isFinite(value)) return undefined;
      const pos = ((sorted.length - 1) * value) / 100;
      const lo = Math.floor(pos);
      return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
    }
    default:
      return undefined;
  }
}

const CELL_IS: Record<string, (v: number, a: number, b: number) => boolean> = {
  lessThan: (v, a) => v < a,
  lessThanOrEqual: (v, a) => v <= a,
  greaterThan: (v, a) => v > a,
  greaterThanOrEqual: (v, a) => v >= a,
  equal: (v, a) => v === a,
  notEqual: (v, a) => v !== a,
  between: (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b),
  notBetween: (v, a, b) => v < Math.min(a, b) || v > Math.max(a, b),
};

/**
 * Colour scales and constant `cellIs` rules, evaluated on the cached values.
 * Formula-based rules, data bars and icon sets are not rendered.
 */
function conditionalCss(ws: ExcelJS.Worksheet, palette: string[], rowLimit: number, colLimit: number): Map<string, { css: Css; filled: boolean }> {
  const out = new Map<string, { css: Css; filled: boolean }>();
  const set = (key: string, prop: string, value: string, filled = false) => {
    const entry = out.get(key) ?? { css: new Map(), filled: false };
    entry.css.set(prop, value);
    entry.filled ||= filled;
    out.set(key, entry);
  };
  const formats = (ws as unknown as { conditionalFormattings?: { ref: string; rules: CfRule[] }[] }).conditionalFormattings ?? [];
  const rules = formats
    .flatMap((f) => f.rules.map((rule) => ({ ref: f.ref, rule })))
    .sort((x, y) => (y.rule.priority ?? 0) - (x.rule.priority ?? 0)); // lowest priority number is applied last and wins
  for (const { ref, rule } of rules) {
    const cells = [...refCells(ref, rowLimit, colLimit)]
      .map(([r, c]) => ({ key: `${r}:${c}`, v: cachedValue(ws.getCell(r, c)) }))
      .filter((x): x is { key: string; v: number } => typeof x.v === 'number' && Number.isFinite(x.v));
    if (!cells.length) continue;
    if (rule.type === 'colorScale' && rule.cfvo && rule.color && rule.cfvo.length === rule.color.length && rule.cfvo.length >= 2) {
      const sorted = cells.map((x) => x.v).sort((a, b) => a - b);
      const stops = rule.cfvo.map((c) => threshold(c, sorted));
      const colors = rule.color.map((c) => resolveColor(c, palette));
      if (stops.some((s) => s === undefined) || colors.some((c) => !c)) continue;
      for (const { key, v } of cells) {
        let i = 0;
        while (i < stops.length - 2 && v > stops[i + 1]!) i++;
        const [s0, s1] = [stops[i]!, stops[i + 1]!];
        const t = s1 === s0 ? 0 : Math.min(1, Math.max(0, (v - s0) / (s1 - s0)));
        const [c0, c1] = [toRgb(colors[i]!.slice(1)), toRgb(colors[i + 1]!.slice(1))];
        set(key, 'background', `#${toHex(c0.map((x, j) => x + (c1[j] - x) * t))}`, true);
      }
    } else if (rule.type === 'cellIs' && rule.operator && CELL_IS[rule.operator]) {
      const [a, b] = (rule.formulae ?? []).map((f) => Number(f));
      if (!Number.isFinite(a) || (rule.operator.includes('etween') && !Number.isFinite(b))) continue;
      const fill = resolveColor(rule.style?.fill?.bgColor ?? rule.style?.fill?.fgColor, palette);
      const font = resolveColor(rule.style?.font?.color, palette);
      for (const { key, v } of cells) {
        if (!CELL_IS[rule.operator](v, a, b)) continue;
        if (fill) set(key, 'background', fill, true);
        if (font) set(key, 'color', font);
        if (rule.style?.font?.bold) set(key, 'font-weight', '700');
        if (rule.style?.font?.italic) set(key, 'font-style', 'italic');
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- workbook

export async function readWorkbook(file: string): Promise<WorkbookModel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const date1904 = Boolean((wb.properties as { date1904?: boolean }).date1904);
  const palette = themePalette(wb);
  const visible = wb.worksheets.filter((ws) => ws.state === 'visible' || ws.state === undefined);
  const raw = rawParts(file);
  return {
    hiddenSheets: wb.worksheets.length - visible.length,
    sheets: visible.map((ws) => readSheet(ws, date1904, palette, raw.pictures.get(ws.name))),
    activeSheet: visible.some((ws) => ws.name === raw.activeSheet) ? raw.activeSheet : undefined,
  };
}

const decodeXml = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e]!);

/** What ExcelJS does not expose: the active sheet, and the cells that hold an in-cell picture (value metadata). */
function rawParts(file: string): { activeSheet?: string; pictures: Map<string, Set<string>> } {
  const pictures = new Map<string, Set<string>>();
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(f.name) });
  } catch {
    return { pictures };
  }
  const workbook = zip['xl/workbook.xml'] ? strFromU8(zip['xl/workbook.xml']) : '';
  const rels = zip['xl/_rels/workbook.xml.rels'] ? strFromU8(zip['xl/_rels/workbook.xml.rels']) : '';
  const target = new Map([...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => [m[0].match(/\sId="([^"]+)"/)?.[1], m[0].match(/\sTarget="([^"]+)"/)?.[1]]));
  const sheets = [...workbook.matchAll(/<sheet\s[^>]*>/g)].map((m) => ({
    name: decodeXml(m[0].match(/\sname="([^"]*)"/)?.[1] ?? ''),
    part: target.get(m[0].match(/\sr:id="([^"]+)"/)?.[1]),
  }));
  const active = Number(workbook.match(/<workbookView\s[^>]*\sactiveTab="(\d+)"/)?.[1] ?? 0);
  for (const { name, part } of sheets) {
    if (!part) continue;
    const xml = zip[part.startsWith('/') ? part.slice(1) : posixpath.join('xl', part)];
    if (!xml) continue;
    const cells = [...strFromU8(xml).matchAll(/<c\s[^>]*\svm="\d+"[^>]*>/g)].map((m) => m[0].match(/\sr="([A-Z]+\d+)"/)?.[1]).filter((a): a is string => !!a);
    if (cells.length) pictures.set(name, new Set(cells));
  }
  return { activeSheet: sheets[active]?.name, pictures };
}

function readSheet(ws: ExcelJS.Worksheet, date1904: boolean, palette: string[], pictures?: Set<string>): Sheet {
  const dims = ws.dimensions as unknown as { bottom: number; right: number } | undefined;
  const lastRow = dims?.bottom ?? 0;
  const lastCol = dims?.right ?? 0;
  const rowLimit = Math.min(lastRow, MAX_ROWS);
  const colLimit = Math.min(lastCol, MAX_COLS);
  const defaultWidth = ws.properties.defaultColWidth ?? 8.43;

  // Rows and columns in collapsed outline groups are shown expanded; only deliberately hidden ones stay hidden.
  const shown = (item: { hidden: boolean; outlineLevel?: number }) => !item.hidden || (item.outlineLevel ?? 0) > 0;
  const colIndexes: number[] = [];
  const columns: SheetColumn[] = [];
  for (let c = 1; c <= colLimit; c++) {
    const col = ws.getColumn(c);
    if (!shown(col)) continue;
    colIndexes.push(c);
    columns.push({ letter: columnLetter(c), width: Math.round((col.width ?? defaultWidth) * 7 + 5) });
  }
  const rowIndexes: number[] = [];
  for (let r = 1; r <= rowLimit; r++) if (shown(ws.getRow(r))) rowIndexes.push(r);

  // The sheet's most common font size is the base size; other sizes are drawn relative to it.
  const sizes = new Map<number, number>();
  for (const r of rowIndexes) {
    ws.getRow(r).eachCell((cell) => {
      const size = Number(cell.font?.size);
      if (size > 0) sizes.set(size, (sizes.get(size) ?? 0) + 1);
    });
  }
  const baseSize = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
  const conditional = conditionalCss(ws, palette, rowLimit, colLimit);

  // Merged ranges span only the rows and columns that are displayed. The first visible cell of a
  // range shows the value of the range's top-left cell; the other displayed cells are covered.
  const spans = new Map<string, { colspan: number; rowspan: number; source: ExcelJS.Cell }>();
  const covered = new Set<string>();
  for (const range of ((ws.model as { merges?: string[] }).merges ?? [])) {
    const [a, b] = range.split(':').map((ref) => ws.getCell(ref));
    const rows = rowIndexes.filter((r) => r >= Number(a.row) && r <= Number(b.row));
    const cols = colIndexes.filter((c) => c >= Number(a.col) && c <= Number(b.col));
    if (!rows.length || !cols.length) continue;
    const anchor = `${rows[0]}:${cols[0]}`;
    spans.set(anchor, { colspan: cols.length, rowspan: rows.length, source: a });
    for (const r of rows) for (const c of cols) if (`${r}:${c}` !== anchor) covered.add(`${r}:${c}`);
  }

  let formulaCount = 0;
  const rows: SheetRow[] = rowIndexes.map((r) => {
    const row = ws.getRow(r);
    const cells = colIndexes.map((c): SheetCell | null => {
      const key = `${r}:${c}`;
      if (covered.has(key)) return null;
      const span = spans.get(key);
      const cell = span?.source ?? row.getCell(c);
      const picture = pictures?.has(cell.address) || undefined;
      const { text, numeric } = picture ? { text: '', numeric: false } : display(cell, date1904);
      const formula = cell.type === V.Formula ? cell.formula : undefined;
      if (formula) formulaCount++;
      const base = cellCss(cell, { palette, baseSize });
      const extra = conditional.get(`${cell.row}:${cell.col}`);
      for (const [prop, value] of extra?.css ?? []) base.css.set(prop, value);
      return {
        text,
        numeric,
        address: cell.address,
        formula: formula ? `=${formula}` : undefined,
        style: serialize(base.css),
        filled: base.filled || extra?.filled || undefined,
        colspan: span?.colspan,
        rowspan: span?.rowspan,
        picture,
      };
    });
    return { index: r, height: row.height ? Math.round((row.height * 4) / 3) : undefined, cells };
  });
  return { name: ws.name, columns, rows, truncated: lastRow > MAX_ROWS || lastCol > MAX_COLS, formulaCount };
}
