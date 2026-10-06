// Research chart engine: CSV/JSON data + semantic props -> static SVG.
// Colors are CSS classes that resolve to design tokens, so branding stays central
// and the same SVG serves screen (light/dark) and A4 print.
import { toNumber, type CsvTable } from './csv.ts';
import { decimalsOf, escapeHtml as esc, formatNumber } from './format.ts';
import { isCalendarDate } from './manifest.ts';

export const CHART_TYPES = ['bar', 'line', 'point', 'range', 'scatter'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const MAX_SERIES = 4;
export const ANNOTATION_KINDS = ['band', 'highlight', 'forecast', 'note', 'line'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export interface ChartOptions {
  type: ChartType;
  x?: string;
  y?: string;
  series?: string;
  orientation?: 'vertical' | 'horizontal';
  /** One x value, series, range category or scatter label emphasised with the single highlight colour. */
  highlight?: string;
  /** Bars: stack the series. */
  stacked?: boolean;
  /** Lines and points: logarithmic value axis. */
  scale?: 'linear' | 'log';
  /** `change`: signed labels and signal colours; `level`: never signal colours. Default: inferred. */
  measure?: 'change' | 'level';
  /** Range charts: columns holding the two ends of each range. */
  low?: string;
  high?: string;
  /** Scatter: column naming each point, and an optional column for bubble area. */
  label?: string;
  size?: string;
}

/** MDX props (all strings) to chart options. */
export function chartOptions(props: Record<string, string | undefined>): ChartOptions {
  return {
    type: props.type as ChartType,
    x: props.x,
    y: props.y,
    series: props.series,
    orientation: props.orientation as ChartOptions['orientation'],
    highlight: props.highlight,
    stacked: props.stacked === 'true',
    scale: props.scale as ChartOptions['scale'],
    measure: props.measure as ChartOptions['measure'],
    low: props.low,
    high: props.high,
    label: props.label,
    size: props.size,
  };
}

interface Point {
  key: string;
  t?: number;
  y: number | null;
}
interface Series {
  name: string;
  points: Point[];
  /** Decimals of this series as written (labels keep them; the axis has its own). */
  decimals: number;
}
interface Range {
  key: string;
  low: number;
  high: number;
  point: number | null;
  /** Decimals of each cell as written: $38.48 and $87 keep their own precision. */
  lowD: number;
  highD: number;
  pointD: number;
}
interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  size: number | null;
}
export interface ChartData {
  xKind: 'time' | 'category';
  categories: string[];
  series: Series[];
  ranges: Range[];
  scatter: ScatterPoint[];
  decimals: number;
  xDecimals: number;
  /** Values are changes: labels carry +/−, a single series uses the signal colours. */
  signed: boolean;
}

export interface Annotation {
  kind: AnnotationKind;
  from?: string;
  to?: string;
  value?: number;
  /** Decimals as written, so an unlabelled reference line prints its own value. */
  valueDecimals?: number;
  label?: string;
  series?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/;
const isRealDate = (key: string) => isCalendarDate(key.length === 7 ? `${key}-01` : key);
const dateValue = (key: string) => Date.parse(key.length === 7 ? `${key}-01` : key);

function requireColumns(table: CsvTable, cols: (string | undefined)[]) {
  for (const col of cols) {
    if (col !== undefined && !table.columns.includes(col)) {
      throw new Error(`column "${col}" not found (available: ${table.columns.join(', ')})`);
    }
  }
}

function numberAt(row: Record<string, string>, col: string, line: number, required: boolean): number | null {
  const raw = row[col] ?? '';
  const value = toNumber(raw);
  if (raw !== '' && value === null) throw new Error(`row ${line}: "${raw}" in column "${col}" is not a number`);
  if (required && value === null) throw new Error(`row ${line}: column "${col}" is empty`);
  return value;
}

const rawDecimals = (raw: string, value: number | null) => Math.min(6, decimalsOf(/e/i.test(raw) && value !== null ? String(value) : raw));

/** Normalise a table into chart data. Throws a readable Error when the data cannot be charted. */
export function prepareChart(table: CsvTable, opts: ChartOptions): ChartData {
  if (!CHART_TYPES.includes(opts.type)) throw new Error(`type must be one of ${CHART_TYPES.join(', ')}`);
  if (!table.rows.length) throw new Error('data has no rows');
  if (opts.stacked && (opts.type !== 'bar' || opts.orientation === 'horizontal')) throw new Error('stacked applies to vertical bar charts only');
  if (opts.scale === 'log' && opts.type !== 'line' && opts.type !== 'point') throw new Error('scale="log" applies to line and point charts only');
  if ((opts.low || opts.high) && opts.type !== 'range') throw new Error('low and high apply to range charts only');
  if ((opts.label || opts.size) && opts.type !== 'scatter') throw new Error('label and size apply to scatter charts only');
  const empty = { ranges: [], scatter: [], series: [], categories: [], xDecimals: 0 };

  if (opts.type === 'scatter') {
    const x = opts.x ?? table.columns[0];
    const y = opts.y ?? table.columns[1];
    requireColumns(table, [x, y, opts.label, opts.size]);
    let decimals = 0;
    let xDecimals = 0;
    const scatter = table.rows.map((row, i) => {
      const px = numberAt(row, x, i + 2, true)!;
      const py = numberAt(row, y, i + 2, true)!;
      decimals = Math.max(decimals, rawDecimals(row[y], py));
      xDecimals = Math.max(xDecimals, rawDecimals(row[x], px));
      const size = opts.size ? numberAt(row, opts.size, i + 2, false) : null;
      if (size !== null && size < 0) throw new Error(`row ${i + 2}: size must not be negative`);
      return { label: opts.label ? row[opts.label] : '', x: px, y: py, size };
    });
    if (opts.highlight !== undefined && !scatter.some((p) => p.label === opts.highlight)) {
      throw new Error(`highlight "${opts.highlight}" matches no label (available: ${scatter.map((p) => p.label).join(', ')})`);
    }
    return { ...empty, xKind: 'category', scatter, decimals, xDecimals, signed: opts.measure === 'change' };
  }

  if (opts.type === 'range') {
    const x = opts.x ?? table.columns[0];
    if (!opts.low || !opts.high) throw new Error('range charts need low and high columns');
    requireColumns(table, [x, opts.low, opts.high, opts.y]);
    let decimals = 0;
    const seen = new Set<string>();
    const ranges = table.rows.map((row, i) => {
      const key = row[x];
      if (!key) throw new Error(`row ${i + 2}: empty value in column "${x}"`);
      if (seen.has(key)) throw new Error(`duplicate "${key}" in column "${x}"`);
      seen.add(key);
      const low = numberAt(row, opts.low!, i + 2, true)!;
      const high = numberAt(row, opts.high!, i + 2, true)!;
      const point = opts.y ? numberAt(row, opts.y, i + 2, false) : null;
      const d = (col: string | undefined) => (col ? rawDecimals(row[col] ?? '', toNumber(row[col])) : 0);
      for (const col of [opts.low!, opts.high!, opts.y]) decimals = Math.max(decimals, d(col));
      const [lowD, highD] = low <= high ? [d(opts.low), d(opts.high)] : [d(opts.high), d(opts.low)];
      return { key, low: Math.min(low, high), high: Math.max(low, high), point, lowD, highD, pointD: d(opts.y) };
    });
    if (opts.highlight !== undefined && !seen.has(opts.highlight)) {
      throw new Error(`highlight "${opts.highlight}" matches no category (available: ${[...seen].join(', ')})`);
    }
    return { ...empty, xKind: 'category', categories: [...seen], ranges, decimals, signed: false };
  }

  const x = opts.x ?? table.columns[0];
  const y = opts.y ?? table.columns[1];
  requireColumns(table, [x, y, opts.series]);
  const xKind = opts.type !== 'bar' && table.rows.every((r) => DATE_PATTERN.test(r[x])) ? 'time' : 'category';
  const seriesMap = new Map<string, Point[]>();
  const seriesDecimals = new Map<string, number>();
  const categories: string[] = [];
  let decimals = 0;
  table.rows.forEach((row, i) => {
    const key = row[x];
    if (!key) throw new Error(`row ${i + 2}: empty value in column "${x}"`);
    if (xKind === 'time' && !isRealDate(key)) throw new Error(`row ${i + 2}: "${key}" is not a real date`);
    const value = numberAt(row, y, i + 2, false);
    decimals = Math.max(decimals, rawDecimals(row[y], value));
    const name = opts.series ? row[opts.series] || '(blank)' : y;
    seriesDecimals.set(name, Math.max(seriesDecimals.get(name) ?? 0, rawDecimals(row[y], value)));
    if (!seriesMap.has(name)) seriesMap.set(name, []);
    const points = seriesMap.get(name)!;
    if (points.some((p) => p.key === key)) throw new Error(`duplicate "${key}" in series "${name}"`);
    points.push({ key, y: value, t: xKind === 'time' ? dateValue(key) : undefined });
    if (!categories.includes(key)) categories.push(key);
  });
  if (seriesMap.size > MAX_SERIES) {
    throw new Error(`${seriesMap.size} series found; charts show at most ${MAX_SERIES} (group the rest as "Other" or split the chart)`);
  }
  // Points run along the axis: by date, or by the category order of first appearance.
  const position = new Map(categories.map((c, i) => [c, i]));
  const series = [...seriesMap].map(([name, points]) => ({
    name,
    decimals: seriesDecimals.get(name) ?? 0,
    points: points.sort(xKind === 'time' ? (a, b) => a.t! - b.t! : (a, b) => position.get(a.key)! - position.get(b.key)!),
  }));
  for (const s of series) {
    if (s.points.every((p) => p.y === null)) throw new Error(`series "${s.name}" has no numeric values in column "${y}"`);
  }
  const values = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  if (opts.stacked && values.some((v) => v < 0)) throw new Error('stacked bars need values of zero or more');
  if (opts.scale === 'log' && values.some((v) => v <= 0)) throw new Error('a log scale needs values above zero');
  // Bars highlight a category (or a series); lines and points highlight a series.
  const h = opts.highlight;
  const matches = series.some((s) => s.name === h) || (opts.type === 'bar' && categories.includes(h!));
  if (h !== undefined && !matches) {
    const names = opts.type === 'bar' ? categories : series.map((s) => s.name);
    throw new Error(`highlight "${h}" matches nothing (available: ${names.join(', ')})`);
  }
  const signed = opts.measure === 'change' ? true : opts.measure === 'level' ? false : values.some((v) => v < 0);
  return { ...empty, xKind, categories, series, decimals, signed };
}

/** Validate annotation rows against the chart they belong to. Throws a readable Error. */
export function prepareAnnotations(table: CsvTable, data: ChartData, opts: ChartOptions): Annotation[] {
  requireColumns(table, ['kind']);
  const vertical = opts.type !== 'scatter' && opts.orientation !== 'horizontal';
  const seriesNames = data.series.map((s) => s.name);
  const counts = new Map<string, number>();
  const times = data.xKind === 'time' ? data.series.flatMap((s) => s.points.map((p) => p.t!)) : [];
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const notes = table.rows.map((row, i): Annotation => {
    const line = i + 2;
    const kind = row.kind as AnnotationKind;
    if (!ANNOTATION_KINDS.includes(kind)) throw new Error(`annotations row ${line}: kind must be one of ${ANNOTATION_KINDS.join(', ')}`);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const value = toNumber(row.value ?? '');
    if ((row.value ?? '') !== '' && value === null) throw new Error(`annotations row ${line}: value "${row.value}" is not a number`);
    const label = (row.label ?? '').trim() || undefined;
    const checkKey = (key: string | undefined, what: string) => {
      if (!key) return;
      if (opts.type === 'scatter') {
        if (!data.scatter.some((p) => p.label === key)) throw new Error(`annotations row ${line}: ${what} "${key}" is not a point label`);
      } else if (data.xKind === 'time') {
        if (!isRealDate(key)) throw new Error(`annotations row ${line}: ${what} "${key}" is not a real date`);
      } else if (!data.categories.includes(key)) {
        throw new Error(`annotations row ${line}: ${what} "${key}" is not a category of the chart`);
      }
    };
    const from = (row.from ?? '').trim() || undefined;
    const to = (row.to ?? '').trim() || undefined;
    checkKey(from, 'from');
    checkKey(to, 'to');
    const series = (row.series ?? '').trim() || undefined;
    if (series && !seriesNames.includes(series)) throw new Error(`annotations row ${line}: series "${series}" is not in the chart`);
    if (kind === 'line' && (value === null) === !from) {
      throw new Error(`annotations row ${line}: a line needs either a value (a level on the value axis) or from (a position along the horizontal axis)`);
    }
    if (kind === 'line' && from && !vertical) throw new Error(`annotations row ${line}: a line at a from position needs a horizontal axis of categories or dates`);
    if ((kind === 'band' || kind === 'highlight') && (!from || !to)) throw new Error(`annotations row ${line}: a ${kind} needs from and to`);
    if (kind === 'forecast' && !from) throw new Error(`annotations row ${line}: a forecast needs from`);
    if (kind === 'note' && (!from || !label)) throw new Error(`annotations row ${line}: a note needs from and a label`);
    if (kind === 'note' && label && label.length > 40) throw new Error(`annotations row ${line}: keep the note label under 40 characters`);
    if ((kind === 'band' || kind === 'highlight' || kind === 'forecast') && !vertical) {
      throw new Error(`annotations row ${line}: ${kind} applies to charts with a horizontal axis of categories or dates`);
    }
    if (opts.scale === 'log' && value !== null && value <= 0) throw new Error(`annotations row ${line}: a log scale needs values above zero`);
    if (data.xKind === 'time' && from) {
      // Dates outside the data would be drawn at the plot edge, which misplaces them silently.
      const a = dateValue(from);
      const b = to ? dateValue(to) : a;
      const outside = kind === 'line' || kind === 'note' ? a < t0 || a > t1 : Math.max(a, b) < t0 || Math.min(a, b) > t1;
      if (outside) throw new Error(`annotations row ${line}: ${from}${to ? `–${to}` : ''} lies outside the chart's dates (${new Date(t0).toISOString().slice(0, 10)} to ${new Date(t1).toISOString().slice(0, 10)})`);
    }
    if (kind === 'note' && value === null && from && opts.type !== 'scatter' && opts.type !== 'range' && data.xKind === 'category') {
      const s = data.series.find((q) => q.name === series) ?? data.series[0];
      if (s.points.find((p) => p.key === from)?.y == null) throw new Error(`annotations row ${line}: the note points at "${from}"${series ? ` in "${series}"` : ''}, which has no value`);
    }
    return { kind, from, to, value: value ?? undefined, valueDecimals: value === null ? undefined : decimalsOf(row.value), label, series };
  });
  for (const kind of ['highlight', 'forecast', 'note'] as const) {
    if ((counts.get(kind) ?? 0) > 1) throw new Error(`annotations: at most one ${kind} per chart (brand rule)`);
  }
  return notes;
}

// ---------------------------------------------------------------- scales

function tickStep(lo: number, hi: number, count: number): number {
  const raw = Math.abs(hi - lo) / Math.max(1, count);
  let step = 10 ** Math.floor(Math.log10(raw));
  const err = raw / step;
  if (err >= Math.sqrt(50)) step *= 10;
  else if (err >= Math.sqrt(10)) step *= 5;
  else if (err >= Math.sqrt(2)) step *= 2;
  return step;
}

interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  decimals: number;
  /** Position along the axis, 0 at lo and 1 at hi. */
  at: (v: number) => number;
}

function niceScale(min: number, max: number, count: number): Scale {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad / 2;
    max += pad / 2;
  }
  const step = tickStep(min, max, count);
  // A value a hair past a tick (a 100.1% stack from rounding) does not add a whole empty step.
  const lo = Math.floor(min / step + 0.01) * step;
  const hi = Math.ceil(max / step - 0.01) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);
  return { lo, hi, ticks, decimals, at: (v) => (v - lo) / (hi - lo) };
}

/** Log axis with ticks at 1, 2 and 5 of each decade. */
function logScale(min: number, max: number): Scale {
  if (!(min > 0) || !Number.isFinite(max)) throw new Error('a log scale needs values above zero');
  const candidates: number[] = [];
  for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++) for (const m of [1, 2, 5]) candidates.push(Number((m * 10 ** e).toPrecision(6)));
  let lo = Math.max(...candidates.filter((c) => c <= min));
  let hi = Math.min(...candidates.filter((c) => c >= max));
  // All values on one tick: widen to the neighbouring ticks.
  if (lo === hi) [lo, hi] = [Math.max(...candidates.filter((c) => c < lo)), Math.min(...candidates.filter((c) => c > hi))];
  const ticks = candidates.filter((c) => c >= lo && c <= hi);
  const decimals = lo < 1 ? Math.ceil(-Math.log10(lo)) : 0;
  return { lo, hi, ticks, decimals, at: (v) => (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

/** Month (or, for spans under two months, day) ticks; the year appears under January and the first tick. */
function timeTicks(t0: number, t1: number, maxTicks: number): { t: number; label: string; sub?: string }[] {
  const ticks: { t: number; label: string; sub?: string }[] = [];
  if (t1 - t0 < 62 * DAY) {
    const days = Math.max(1, Math.round((t1 - t0) / DAY));
    const step = [1, 2, 3, 7, 14, 21].find((s) => days / s <= maxTicks) ?? 31;
    for (let t = t0; t <= t1 + 1; t += step * DAY) {
      const d = new Date(t);
      const year = d.getUTCFullYear();
      const newYear = !ticks.length || new Date(ticks[ticks.length - 1].t).getUTCFullYear() !== year;
      ticks.push({ t, label: `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`, sub: newYear ? String(year) : undefined });
    }
    return ticks;
  }
  const a = new Date(t0);
  const b = new Date(t1);
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const step = [1, 2, 3, 6, 12, 24, 60].find((s) => months / s <= maxTicks) ?? 120;
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth() + (a.getUTCDate() > 1 ? 1 : 0);
  for (let guard = 0; guard < 600; guard++) {
    y += Math.floor(m / 12);
    m %= 12;
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if ((y * 12 + m) % step === 0) {
      if (step >= 12) ticks.push({ t, label: String(y) });
      else ticks.push({ t, label: MON[m], sub: m === 0 || !ticks.length ? String(y) : undefined });
    }
    m += 1;
  }
  return ticks;
}

// ---------------------------------------------------------------- rendering helpers

const textWidth = (s: string, px: number, narrow = true) => s.length * px * (narrow ? 0.5 : 0.56);
/** Width of an 11px uppercase band label (label width, tracking), measured per letter class. */
const capsWidth = (s: string) =>
  [...s].reduce((w, ch) => w + (/[\s·.,:;'’/|-]/.test(ch) ? 4.5 : ch === 'I' ? 4.5 : /[MW]/.test(ch) ? 12.5 : /\d/.test(ch) ? 8.5 : 10), 0);
const seriesClass = (i: number) => `s${Math.min(i, MAX_SERIES - 1) + 1}`;
const r = (n: number) => Math.round(n * 10) / 10;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Box of a single-line label at baseline y. */
const labelBox = (x: number, y: number, w: number, anchor: string, size = 11): Box => {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x0, x1: x0 + w, y0: y - size + 1, y1: y + 2 };
};
/** Does the segment (x1,y1)–(x2,y2) pass through the box? */
function segmentHits(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  if (Math.max(x1, x2) < b.x0 || Math.min(x1, x2) > b.x1 || Math.max(y1, y2) < b.y0 || Math.min(y1, y2) > b.y1) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
  for (let k = 0; k <= steps; k++) {
    const x = x1 + ((x2 - x1) * k) / steps;
    const y = y1 + ((y2 - y1) * k) / steps;
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

/** The two-line split of a label with the narrowest widest line. */
function splitTwo(label: string, width: (s: string) => number): string[] {
  const words = label.split(' ');
  let best = [label];
  let bestWidth = width(label);
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(...lines.map(width));
    if (w < bestWidth) {
      best = lines;
      bestWidth = w;
    }
  }
  return best;
}

function wrapLabel(label: string, maxWidth: number, px: number, narrow = true): string[] {
  if (textWidth(label, px, narrow) <= maxWidth || !label.includes(' ')) return [label];
  return splitTwo(label, (l) => textWidth(l, px, narrow));
}

/** Shorten text with an ellipsis to fit a width ('' when not even one letter fits). */
function fitText(s: string, maxWidth: number, width: (s: string) => number): string {
  if (width(s) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && width(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return width(`${t}…`) <= maxWidth ? `${t.trimEnd()}…` : '';
}
const fitPlain = (s: string, maxWidth: number, px: number) => fitText(s, maxWidth, (t) => textWidth(t, px, false));

/**
 * Category axis labels (wrapped to two lines when possible). When labels still collide, every n-th is kept: quarters stay
 * on Q1 of each year, other axes keep the latest category.
 */
function categoryLabels(categories: string[], step: number) {
  const lines = categories.map((c) => wrapLabel(c, step - 6, 11));
  const widest = Math.max(...lines.flat().map((l) => textWidth(l, 11)));
  let every = Math.max(1, Math.ceil((widest + 6) / step));
  const quarterly = categories.length > 4 && categories.every((c) => /^Q[1-4]\b/.test(c));
  if (quarterly && every > 1) every = every === 2 ? 2 : Math.ceil(every / 4) * 4;
  const offset = quarterly ? Math.max(0, categories.findIndex((c) => c.startsWith('Q1'))) % every : (categories.length - 1) % every;
  return { lines, every, shown: (i: number) => (((i - offset) % every) + every) % every === 0, height: 12 * Math.max(...lines.map((l) => l.length)) };
}

function text(x: number, y: number, content: string | string[], cls: string, anchor = 'middle', lineHeight = 12): string {
  const lines = Array.isArray(content) ? content : [content];
  const inner = lines.map((l, i) => `<tspan x="${r(x)}" dy="${i ? lineHeight : 0}">${esc(l)}</tspan>`).join('');
  return `<text class="${cls}" x="${r(x)}" y="${r(y)}" text-anchor="${anchor}">${inner}</text>`;
}

/** An axis label centred on x, kept inside the chart at both edges. */
function axisText(x: number, y: number, content: string | string[], W: number): string {
  const lines = Array.isArray(content) ? content : [content];
  const w = Math.max(...lines.map((l) => textWidth(l, 11)));
  if (x + w / 2 > W - 1) return text(W - 1, y, lines, 'ax', 'end');
  if (x - w / 2 < 1) return text(1, y, lines, 'ax', 'start');
  return text(x, y, lines, 'ax');
}

/** Legend swatches in rows that wrap at `maxRight`. */
function legend(series: Series[], x: number, y: number, maxRight: number, highlight?: string): { svg: string; rows: number } {
  let cx = x;
  let cy = y;
  let rows = 1;
  let svg = '';
  series.forEach((s, i) => {
    const width = 14 + textWidth(s.name, 11) + 18;
    if (cx > x && cx + width - 18 > maxRight) {
      cx = x;
      cy += 16;
      rows += 1;
    }
    svg += `<rect class="bar ${s.name === highlight ? 'hl' : seriesClass(i)}" x="${r(cx)}" y="${r(cy - 9)}" width="10" height="10"/>${text(cx + 14, cy, s.name, 'lg', 'start')}`;
    cx += width;
  });
  return { svg, rows };
}

// ---------------------------------------------------------------- annotation layer

/** x extent [start, end] of a category or date key along the horizontal axis. */
type Span = (key: string) => [number, number] | undefined;

/** Geometry a chart hands to the annotation layer. */
interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Height of the band-label rows above the plot. */
  bandH: number;
  span?: Span;
  /** Position of a value on the value axis (y for vertical charts, x for horizontal ones). */
  value: (v: number) => number;
  horizontal: boolean;
  /** Preferred end for labels of horizontal reference lines (they move when they would cover data). */
  refLabels: 'left' | 'right';
  /** SVG width: labels stay inside it. */
  width: number;
  /** Where a note at key (and series, and value) points. */
  anchor: (key: string, series?: string, value?: number) => NoteAnchor | undefined;
  /** Bars put a low note beside the bar; lines, points and ranges always have room above. */
  noteSide?: boolean;
  /** Does a label box cover data (lines, bars, points, value labels)? */
  hits?: (box: Box) => boolean;
}

interface NoteAnchor {
  x: number;
  y: number;
  /** Force the label above the point or beside it (default: decided by the chart). */
  place?: 'up' | 'side';
  /** Beside the point: distance from the point to the label, clear of the point's own value label. */
  gap?: number;
  prefer?: 'left' | 'right';
}

const isBand = (n: Annotation) => n.kind === 'band' || n.kind === 'highlight' || n.kind === 'forecast';
const NOTE_PAD = 26;
const notePad = (notes: Annotation[]) => (notes.some((n) => n.kind === 'note') ? NOTE_PAD : 0);
/** Room above the plot for labels of vertical reference lines. */
const markerPad = (notes: Annotation[]) => (notes.some((n) => n.kind === 'line' && n.value === undefined) ? 4 : 0);
/**
 * A note near the top of the plot has its label lifted above the band labels; its leader then crosses the band-label rows,
 * so those labels keep clear of the leader. `distance` is the ring's estimated distance from the top of the plot.
 */
const leaderLane = (x: number | undefined, distance: number): number | undefined => (x !== undefined && distance < 50 ? x : undefined);

interface BandBox {
  n: Annotation;
  x0: number;
  x1: number;
}

function bandBoxes(notes: Annotation[], span: Span | undefined, right: number): BandBox[] {
  if (!span) return [];
  return notes
    .filter(isBand)
    .map((n) => {
      const a = span(n.from!);
      const b = n.to ? span(n.to) : ([right, right] as [number, number]);
      return a && b ? { n, x0: Math.min(a[0], b[0]), x1: Math.max(a[1], b[1]) } : undefined;
    })
    .filter((b): b is BandBox => !!b)
    .sort((a, b) => a.x0 - b.x0);
}

/**
 * Band labels sit above the plot and always start inside their own band. A label that would run into its neighbour moves
 * up one row; then the short form before " · " is tried ("IV · Collapse" → "IV"); only then is it shortened. Labels keep
 * clear of a lifted note's leader line (`lane`).
 */
function bandLabels(notes: Annotation[], span: Span | undefined, left: number, right: number, lane?: number) {
  const GAP = 14;
  const rows: [number, number][][] = [[], []];
  const blocked = (a: number, b: number) => lane !== undefined && a < lane + 5 && b > lane - 5;
  const fits = (row: number, a: number, b: number) =>
    b <= right && !blocked(a, b) && rows[row].every(([c, d]) => b + GAP <= c || a >= d + GAP);
  const placed = bandBoxes(notes, span, right)
    .filter((b) => b.n.label || b.n.kind === 'forecast')
    .map((b) => {
      const full = (b.n.label ?? 'Forecast').toUpperCase();
      const short = full.includes(' · ') ? full.split(' · ')[0] : undefined;
      const start = Math.max(left, b.x0) + 4;
      let spot: { row: number; words: string } | undefined;
      for (const words of short ? [full, short] : [full]) {
        for (let row = 0; row < rows.length && !spot; row++) if (fits(row, start, start + capsWidth(words))) spot = { row, words };
        if (spot) break;
      }
      if (!spot) {
        // Shorten to the most room any row offers from the band's start (no label when no row has room).
        let best = { row: 0, room: -1 };
        rows.forEach((intervals, row) => {
          if (!intervals.every(([c, d]) => start >= d + GAP || start + GAP <= c)) return;
          const stops = [right, ...intervals.map(([c]) => c - GAP).filter((c) => c > start), ...(lane !== undefined && lane > start ? [lane - 5] : [])];
          const room = Math.min(...stops) - start;
          if (room > best.room) best = { row, room };
        });
        const cut = best.room > 0 ? fitText(short ?? full, best.room, capsWidth) : '';
        // "KR…" says nothing: a label cut below three letters is left out (the caption names the band).
        spot = { row: best.row, words: cut.replace('…', '').length >= 3 ? cut : '' };
      }
      rows[spot.row].push([start, start + capsWidth(spot.words)]);
      const cls = b.n.kind === 'band' ? 'band-lbl' : b.n.kind === 'highlight' ? 'hlband-lbl' : 'fcband-lbl';
      return { x: start, ...spot, cls };
    })
    .filter((p) => p.words);
  const used = Math.max(0, ...placed.map((p) => p.row + 1));
  return {
    height: used ? used * 12 + 4 : 0,
    render: (top: number) => placed.map((p) => text(p.x, top - 5 - p.row * 12, p.words, p.cls, 'start')).join(''),
  };
}

/** Background bands: quiet eras in Ice (separated by a hairline of paper), the highlighted period, the forecast. */
function bandLayer(notes: Annotation[], f: Frame): string {
  return bandBoxes(notes, f.span, f.right)
    .map((b) => {
      const x0 = Math.max(f.left, b.x0);
      const x1 = Math.min(f.right, b.x1);
      const cls = b.n.kind === 'band' ? 'band' : b.n.kind === 'highlight' ? 'hlband' : 'fcband';
      const inset = b.n.kind === 'band' ? 1.5 : 0;
      return `<rect class="${cls}" x="${r(x0 + inset)}" y="${r(f.top)}" width="${r(Math.max(1, x1 - x0 - 2 * inset))}" height="${r(f.bottom - f.top)}"/>`;
    })
    .join('');
}

/** Foreground marks: reference lines and the single copper note. */
function markLayer(notes: Annotation[], f: Frame, fmt: (v: number, minDecimals?: number) => string): string {
  // Reference lines go under the chart's value labels (DL_SLOT), their labels and the note above them.
  let under = '';
  let svg = '';
  const lines = notes.filter((a) => a.kind === 'line');
  // x of every vertical line (value lines on horizontal charts, markers on vertical ones): no label may cover another's line.
  const verticalAt = lines
    .map((n) => (n.value !== undefined ? (f.horizontal ? f.value(n.value) : undefined) : n.from && f.span?.(n.from) ? (f.span(n.from)![0] + f.span(n.from)![1]) / 2 : undefined))
    .filter((x): x is number => x !== undefined);
  const placedLabels: Box[] = [];
  // The note's ring is drawn last but claims its spot first.
  const noteAt = notes.find((a) => a.kind === 'note');
  const ring = noteAt && f.anchor(noteAt.from!, noteAt.series, noteAt.value);
  const ringBox = ring ? { x0: ring.x - 9, x1: ring.x + 9, y0: ring.y - 9, y1: ring.y + 9 } : undefined;
  const clearOf = (box: Box, own: number) =>
    box.x0 >= 1 && box.x1 <= f.width - 1 && !placedLabels.some((b) => overlaps(b, box)) && !verticalAt.some((x) => x !== own && x > box.x0 - 3 && x < box.x1 + 3);
  for (const n of lines) {
    if (n.value !== undefined && !f.horizontal) {
      // A level across the plot: its label goes where it covers no data.
      const p = f.value(n.value);
      const label = n.label ?? fmt(n.value, n.valueDecimals);
      const w = textWidth(label, 11, false);
      // Candidates: either end of the line (preferred end first), then along it; above the line, then below.
      const ends: [number, string][] = [
        [f.left + 4, 'start'],
        [f.right - 2, 'end'],
      ];
      if (f.refLabels === 'right') ends.reverse();
      const along: [number, string][] = [0.25, 0.5, 0.75].map((q) => [f.left + q * (f.right - f.left), 'middle']);
      const spots = [p - 4, p + 12].flatMap((y) => [...ends, ...along].map(([x, anchor]) => ({ x, y, anchor, box: labelBox(x, y, w, anchor) })));
      const free = (c: (typeof spots)[number]) => !f.hits?.(c.box) && !placedLabels.some((b) => overlaps(b, c.box)) && !(ringBox && overlaps(ringBox, c.box));
      const pick = spots.find(free) ?? spots[0];
      placedLabels.push(pick.box);
      under += `<line class="ref" x1="${r(f.left)}" x2="${r(f.right)}" y1="${r(p)}" y2="${r(p)}"/>`;
      svg += text(pick.x, pick.y, label, 'ref-lbl', pick.anchor);
      continue;
    }
    // A vertical line: a value on a horizontal chart (label above the plot) or a marker at `from` (label inside the top).
    const marker = n.value === undefined;
    const s0 = marker && n.from ? f.span?.(n.from) : undefined;
    const x = marker ? (s0 ? (s0[0] + s0[1]) / 2 : undefined) : f.value(n.value!);
    if (x === undefined) continue;
    const label = n.label ?? (marker ? n.from! : fmt(n.value!, n.valueDecimals));
    const w = textWidth(label, 11, false);
    const rowY = (k: number) => (marker ? f.top + 11 + 13 * k : f.top - 8 - 13 * k);
    const sides = x + 4 + w > f.right ? ['left', 'right'] : ['right', 'left'];
    let pick: { box: Box; side: string; y: number } | undefined;
    for (let k = 0; k < 3 && !pick; k++) {
      for (const side of sides) {
        const box = labelBox(side === 'left' ? x - 4 : x + 4, rowY(k), w, side === 'left' ? 'end' : 'start');
        if (clearOf(box, x)) {
          pick = { box, side, y: rowY(k) };
          break;
        }
      }
    }
    pick ??= { box: labelBox(sides[0] === 'left' ? x - 4 : x + 4, rowY(0), w, sides[0] === 'left' ? 'end' : 'start'), side: sides[0], y: rowY(0) };
    placedLabels.push(pick.box);
    const y1 = marker ? f.top - 4 : pick.y + 4;
    under += `<line class="ref" x1="${r(x)}" x2="${r(x)}" y1="${r(y1)}" y2="${r(f.bottom)}"/>`;
    svg += text(pick.side === 'left' ? x - 4 : x + 4, pick.y, label, 'ref-lbl', pick.side === 'left' ? 'end' : 'start');
  }
  const note = notes.find((a) => a.kind === 'note');
  const at = note && f.anchor(note.from!, note.series, note.value);
  if (note && at) {
    const { x, y } = at;
    const label = note.label!;
    const w = textWidth(label, 12, false);
    const mid = (f.left + f.right) / 2;
    svg += `<circle class="note-ring" cx="${r(x)}" cy="${r(y)}" r="6"/>`;
    // Candidate spots: above the point (or lifted above the plot), beside it, below it. The chart's preferred spot comes
    // first; the first one whose label covers no data, other labels or reference lines wins.
    type Spot = { box: Box; svg: (text: string) => string };
    const vertical = (ly: number, anchor: string): Spot => {
      const tx = anchor === 'end' ? x + 6 : x - 6;
      const below = ly > y;
      return {
        box: labelBox(tx, ly, w, anchor, 12),
        svg: (t) =>
          `<line class="note-line" x1="${r(x)}" y1="${r(below ? y + 6 : y - 6)}" x2="${r(x)}" y2="${r(below ? ly - 12 : ly + 3)}"/>` +
          text(tx, ly, t, 'note-lbl', anchor),
      };
    };
    const beside = (toLeft: boolean): Spot => {
      const gap = at.gap ?? 10;
      const dir = toLeft ? -1 : 1;
      const tx = x + dir * (gap + 2);
      return {
        box: labelBox(tx, y + 4, w, toLeft ? 'end' : 'start', 12),
        svg: (t) =>
          `<line class="note-line" x1="${r(x + dir * 6)}" y1="${r(y)}" x2="${r(x + dir * gap)}" y2="${r(y)}"/>` +
          text(tx, y + 4, t, 'note-lbl', toLeft ? 'end' : 'start'),
      };
    };
    const up = at.place === 'up' || (at.place !== 'side' && (!f.noteSide || y - f.top <= 0.55 * (f.bottom - f.top)));
    // Above the point; lifted over the band labels when the point is at the top of the plot.
    let ly = y - 22;
    if (ly > f.top - f.bandH - 8 && ly - 12 < f.top) ly = Math.min(ly, f.top - f.bandH - 8);
    const lifted = f.top - f.bandH - 10;
    const anchors = x > mid ? ['end', 'start'] : ['start', 'end'];
    const sides = at.prefer ? [at.prefer === 'left', at.prefer !== 'left'] : [x > mid, x <= mid];
    // Lifted rows: the top of the room kept for the note, then one row higher (clear of a total label at the top of the plot).
    const above = [ly, lifted, lifted - 14].filter((v, k) => k === 0 || v < ly - 1).flatMap((v) => anchors.map((a) => vertical(v, a)));
    const side = sides.map(beside);
    const below = at.place === 'up' ? [] : anchors.map((a) => vertical(y + 30, a)).filter((c) => c.box.y1 <= f.bottom);
    const spots = up ? [...above, ...side, ...below] : [...side, ...above, ...below];
    const free = (c: Spot) =>
      c.box.x0 >= 2 &&
      c.box.x1 <= f.width - 2 &&
      c.box.y0 >= 0 &&
      !f.hits?.(c.box) &&
      !placedLabels.some((b) => overlaps(b, c.box)) &&
      !verticalAt.some((vx) => vx > c.box.x0 - 3 && vx < c.box.x1 + 3);
    const pick = spots.find(free);
    if (pick) svg += pick.svg(label);
    else if (up) {
      // Nothing is clear: the preferred spot above, shortened to the room there.
      let anchor = anchors[0];
      let tx = anchor === 'end' ? x + 6 : x - 6;
      if (anchor === 'end' && tx - w < 2) [anchor, tx] = ['start', x - 6];
      if (anchor === 'start' && tx + w > f.width - 2) [anchor, tx] = ['end', x + 6];
      const room = anchor === 'start' ? f.width - 2 - tx : tx - 2;
      svg += vertical(ly, anchor).svg(fitPlain(label, room, 12) || label);
    } else {
      // Beside the point, on the side with room (towards the middle unless the chart prefers a side).
      const gap = at.gap ?? 10;
      const roomRight = f.width - 2 - (x + gap + 2);
      const roomLeft = x - gap - 2 - 2;
      let toLeft = at.prefer ? at.prefer === 'left' : x > mid;
      if (toLeft && roomLeft < w && roomRight > roomLeft) toLeft = false;
      else if (!toLeft && roomRight < w && roomLeft > roomRight) toLeft = true;
      svg += beside(toLeft).svg(fitPlain(label, toLeft ? roomLeft : roomRight, 12) || label);
    }
  }
  return `${under}${DL_SLOT}${svg}`;
}

// ---------------------------------------------------------------- charts

export interface RenderSize {
  width: number;
  height: number;
}

interface Body {
  svg: string;
  height: number;
  /** Some category names were left out because they did not fit. */
  thinned?: boolean;
}

/** Where the mark layer wants the chart's value labels: above reference lines, below the note. */
const DL_SLOT = '<!--dl-->';
const DL_TEXT = /<text class="dl[^"]*"[^>]*>.*?<\/text>/g;
const BAND_TEXT = /<text class="(?:band|hlband|fcband)-lbl"[^>]*>.*?<\/text>/g;
/** Years, fiscal years, halves, quarters and months: such an axis stays readable when only every other period is named. */
const PERIOD =
  /^(?:(?:FY|CY)\s?'?\d{2}(?:\d{2})?[A-Z]?|\d{4}[A-Z]?|[1-4][QH]\s?'?\d{2,4}[A-Z]?|[QH][1-4](?:\s?(?:FY|CY)?'?\d{2,4}[A-Z]?)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?[\s-]'?\d{2,4})$/i;

/**
 * Vertical bars or ranges whose category names would be thinned out (a phone-width chart of named categories) are drawn
 * sideways instead, so that every bar keeps its name. Stacks, period axes and charts with bands or markers stay upright.
 */
function canTurn(data: ChartData, opts: ChartOptions, notes: Annotation[]): boolean {
  if (opts.stacked || (opts.type !== 'bar' && opts.type !== 'range')) return false;
  if (data.categories.every((c) => PERIOD.test(c.trim()))) return false;
  return notes.every((n) => n.kind === 'note' || (n.kind === 'line' && n.value !== undefined));
}

export function renderChartSvg(data: ChartData, opts: ChartOptions, size: RenderSize, label: string, notes: Annotation[] = []): string {
  let body = drawChart(data, opts, size, notes);
  if (body.thinned && canTurn(data, opts, notes)) body = drawChart(data, { ...opts, orientation: 'horizontal' }, size, notes);
  // Value labels go above the reference lines (their halo keeps a crossing line legible) and below the note.
  let svg = body.svg;
  if (svg.includes(DL_SLOT)) {
    const labels = svg.match(DL_TEXT) ?? [];
    svg = svg.replace(DL_TEXT, '').replace(DL_SLOT, labels.join(''));
  }
  // Band labels go on top (with a halo), so a lifted note's leader passes behind them.
  const bandLabels = svg.match(BAND_TEXT) ?? [];
  svg = svg.replace(BAND_TEXT, '') + bandLabels.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${body.height}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}

function drawChart(data: ChartData, opts: ChartOptions, size: RenderSize, notes: Annotation[]): Body {
  return (
    opts.type === 'scatter'
      ? scatterPlot(data, opts, size, notes)
      : opts.type === 'range'
        ? opts.orientation === 'horizontal'
          ? horizontalRanges(data, opts, size, notes)
          : verticalRanges(data, opts, size, notes)
        : opts.type === 'bar'
          ? opts.orientation === 'horizontal'
            ? horizontalBars(data, opts, size, notes)
            : verticalBars(data, opts, size, notes)
          : lineOrPoints(data, opts, size, notes)
  );
}

/** Bar labels: a signed single series carries +/− and the signal colours. */
function barFormatter(data: ChartData) {
  const signed = data.series.length === 1 && data.signed;
  return { signed, fmt: (v: number) => formatNumber(v, data.decimals, signed) };
}

const refValues = (notes: Annotation[]) => notes.filter((n) => n.kind === 'line' && n.value !== undefined).map((n) => n.value!);
const categorySpan =
  (categories: string[], left: number, step: number): Span =>
  (c) => {
    const i = categories.indexOf(c);
    return i < 0 ? undefined : [left + i * step, left + (i + 1) * step];
  };
const noteOf = (notes: Annotation[]) => notes.find((n) => n.kind === 'note');

function verticalBars(data: ChartData, opts: ChartOptions, { width: W, height: H }: RenderSize, notes: Annotation[]): Body {
  const { signed: singleSigned, fmt } = barFormatter(data);
  const multi = data.series.length > 1;
  const stacked = Boolean(opts.stacked) && multi;
  const values = data.series.flatMap((s) => s.points.map((p) => p.y ?? 0));
  const totals = data.categories.map((c) => data.series.reduce((sum, s) => sum + (s.points.find((p) => p.key === c)?.y ?? 0), 0));
  const extent = stacked ? totals : values;
  const scale = niceScale(Math.min(0, ...extent, ...refValues(notes)), Math.max(0, ...extent, ...refValues(notes)), W < 500 ? 4 : 5);
  const tickLabels = scale.ticks.map((t) => formatNumber(t, scale.decimals, singleSigned));
  const left = Math.max(...tickLabels.map((l) => textWidth(l, 11))) + 12;
  const right = 6;
  const n = data.categories.length;
  const plotW = W - left - right;
  const step = plotW / n;
  const span = categorySpan(data.categories, left, step);
  const k = stacked ? 1 : data.series.length;
  const groupW = step * (multi && !stacked ? 0.78 : 0.58);
  const gap = multi && !stacked ? 2 : 0;
  const barW = (groupW - gap * (k - 1)) / k;
  // A stack total may use the gap between stacks; a bar's own label must fit over the bar.
  const labelFits = stacked
    ? step * 0.92 >= Math.max(...totals.map((v) => textWidth(fmt(v), 12)))
    : barW >= Math.max(...values.map((v) => textWidth(fmt(v), 12))) - 2;
  const valueAt = (c: string, j: number) => data.series[j].points.find((p) => p.key === c)?.y ?? 0;
  const seriesIndex = (series?: string) => Math.max(0, series ? data.series.findIndex((s) => s.name === series) : 0);
  const barX = (i: number, j: number) => (multi && !stacked ? left + i * step + (step - groupW) / 2 + j * (barW + gap) + barW / 2 : left + i * step + step / 2);
  const note = noteOf(notes);
  const noteI = note ? data.categories.indexOf(note.from!) : -1;
  const noteV = note && noteI >= 0 ? (note.value ?? (stacked ? totals[noteI] : valueAt(note.from!, seriesIndex(note.series)))) : 0;
  const bands = bandLabels(notes, span, left, W - right, leaderLane(noteI >= 0 ? barX(noteI, seriesIndex(note?.series)) : undefined, (1 - scale.at(noteV)) * (H - 90) - (labelFits ? 22 : 0)));
  const key = multi ? legend(data.series, left, 12, W - right, opts.highlight) : undefined;
  // A note on a labelled bar sits above the value label, so it needs that much more room.
  const top = (key ? 20 + 18 * key.rows : 20) + bands.height + notePad(notes) * (labelFits ? 1.85 : 1) + markerPad(notes);
  const cats = categoryLabels(data.categories, step);
  // Room below the plot for labels under the most negative bars, so they never meet the axis labels.
  const negPad = labelFits && values.some((v) => v < 0) ? 14 : 0;
  const bottom = 10 + cats.height + negPad;
  const plotH = H - top - bottom;
  const y = (v: number) => top + (1 - scale.at(v)) * plotH;
  const occupied: Box[] = [];
  const frame: Frame = {
    left,
    right: W - right,
    top,
    bottom: top + plotH,
    bandH: bands.height,
    width: W,
    horizontal: false,
    refLabels: 'right',
    noteSide: true,
    value: y,
    span,
    hits: (box) => occupied.some((b) => overlaps(b, box)),
    anchor: (c, series, value) => {
      const i = data.categories.indexOf(c);
      if (i < 0) return undefined;
      const j = seriesIndex(series);
      const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
      if (stacked) {
        // The top of the named series' segment, or of the whole stack; clear of the total's label.
        const upTo = series ? data.series.slice(0, j + 1).reduce((sum, _, q) => sum + valueAt(c, q), 0) : totals[i];
        const at = value ?? upTo;
        return { x: barX(i, j), y: y(at) - (labelFits && same(at, totals[i]) ? 22 : 0) };
      }
      const v = valueAt(c, j);
      const x = barX(i, j);
      const at = value ?? v;
      // A negative bar: the ring on its end, the label beside it, clear of the value label underneath.
      if (v < 0 && same(at, v)) return { x, y: y(v), place: 'side', gap: labelFits ? textWidth(fmt(v), 12) / 2 + 8 : 10 };
      // Above a positive bar: clear of its value label, so the ring never sits on the number.
      return { x, y: y(at) - (labelFits && v >= 0 && same(at, v) ? 22 : 0) };
    },
  };
  let svg = bandLayer(notes, frame) + bands.render(top);
  for (const [i, t] of scale.ticks.entries()) {
    if (t !== 0) svg += `<line class="grid" x1="${r(left)}" x2="${r(W - right)}" y1="${r(y(t))}" y2="${r(y(t))}"/>`;
    svg += text(left - 8, y(t) + 4, tickLabels[i], 'ax', 'end');
  }
  data.categories.forEach((cat, i) => {
    let base = 0;
    data.series.forEach((s, j) => {
      const v = s.points.find((p) => p.key === cat)?.y;
      if (v == null) return;
      const hl = opts.highlight !== undefined && (opts.highlight === cat || opts.highlight === s.name);
      const cls = hl ? 'hl' : singleSigned ? (v < 0 ? 'neg' : 'pos') : seriesClass(j);
      const tip = `${cat}${multi ? ` · ${s.name}` : ''}: ${fmt(v)}`;
      if (stacked) {
        const y0 = y(base + v);
        const h = Math.max(0, y(base) - y0);
        const x0 = left + i * step + (step - groupW) / 2;
        occupied.push({ x0, x1: x0 + barW, y0, y1: y0 + h });
        svg += `<rect class="bar ${cls}" x="${r(x0)}" y="${r(y0)}" width="${r(barW)}" height="${r(h)}"><title>${esc(tip)}</title></rect>`;
        base += v;
        return;
      }
      const x0 = left + i * step + (step - groupW) / 2 + j * (barW + gap);
      const y0 = y(Math.max(v, 0));
      const h = Math.max(1, y(Math.min(v, 0)) - y0);
      occupied.push({ x0, x1: x0 + barW, y0, y1: y0 + h });
      svg += `<rect class="bar ${cls}" x="${r(x0)}" y="${r(y0)}" width="${r(barW)}" height="${r(h)}"><title>${esc(tip)}</title></rect>`;
      if (labelFits) {
        const ly = v < 0 ? y0 + h + 13 : y0 - 5;
        occupied.push(labelBox(x0 + barW / 2, ly, textWidth(fmt(v), 12), 'middle', 12));
        svg += text(x0 + barW / 2, ly, fmt(v), `dl ${cls}`);
      }
    });
    if (stacked && labelFits) {
      occupied.push(labelBox(left + i * step + step / 2, y(totals[i]) - 5, textWidth(fmt(totals[i]), 12), 'middle', 12));
      svg += text(left + i * step + step / 2, y(totals[i]) - 5, fmt(totals[i]), 'dl');
    }
    if (cats.shown(i)) svg += axisText(left + i * step + step / 2, top + plotH + negPad + 16, cats.lines[i], W);
  });
  svg += `<line class="zero" x1="${r(left)}" x2="${r(W - right)}" y1="${r(y(0))}" y2="${r(y(0))}"/>`;
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d), singleSigned));
  if (key) svg += key.svg;
  return { svg, height: H, thinned: cats.every > 1 };
}

function horizontalBars(data: ChartData, opts: ChartOptions, { width: W }: RenderSize, notes: Annotation[]): Body {
  const { signed: singleSigned, fmt } = barFormatter(data);
  const multi = data.series.length > 1;
  const values = data.series.flatMap((s) => s.points.map((p) => p.y ?? 0));
  const refs = refValues(notes);
  const lo = Math.min(0, ...values, ...refs);
  const hi = Math.max(0, ...values, ...refs);
  const maxLabel = Math.max(...values.map((v) => textWidth(fmt(v), 12))) + 8;
  const catMax = W * 0.42;
  const catLines = data.categories.map((c) => wrapLabel(c, catMax, 11, false).map((l) => fitPlain(l, catMax, 11)));
  const catW = Math.min(catMax, Math.max(...catLines.flat().map((l) => textWidth(l, 11))));
  const left = catW + 14 + (lo < 0 ? maxLabel : 0);
  const right = maxLabel + 4;
  const key = multi ? legend(data.series, left, 12, W - 4, opts.highlight) : undefined;
  const top = (key ? 12 + 18 * key.rows : 6) + (refs.length ? 3 + 13 * refs.length : 0) + notePad(notes);
  const rowH = (multi ? 16 * data.series.length + 12 : 30) + (catLines.some((l) => l.length > 1) ? 4 : 0);
  const H = top + rowH * data.categories.length + 6;
  const plotW = W - left - right;
  const x = (v: number) => left + ((v - lo) / (hi - lo || 1)) * plotW;
  const k = data.series.length;
  const band = rowH * (multi ? 0.8 : 0.58);
  const barH = band / k;
  const frame: Frame = {
    left,
    right: W - right,
    top,
    bottom: H - 6,
    bandH: 0,
    width: W,
    horizontal: true,
    refLabels: 'right',
    value: x,
    anchor: (c, series, value) => {
      const i = data.categories.indexOf(c);
      if (i < 0) return undefined;
      const j = Math.max(0, series ? data.series.findIndex((s) => s.name === series) : 0);
      const v = data.series[j].points.find((p) => p.key === c)?.y ?? 0;
      const atEnd = value === undefined || value === v;
      // Beside the bar end, past its value label.
      return {
        x: x(value ?? v),
        y: top + i * rowH + (rowH - band) / 2 + j * barH + barH / 2,
        place: 'side',
        gap: atEnd ? textWidth(fmt(v), 12) + 14 : 10,
        prefer: v < 0 ? 'left' : 'right',
      };
    },
  };
  let svg = '';
  data.categories.forEach((cat, i) => {
    const rowTop = top + i * rowH;
    const lines = catLines[i];
    svg += text(catW + 2, rowTop + rowH / 2 + 4 - (lines.length - 1) * 6, lines, 'ax cat', 'end');
    data.series.forEach((s, j) => {
      const v = s.points.find((p) => p.key === cat)?.y;
      if (v == null) return;
      const y0 = rowTop + (rowH - band) / 2 + j * barH;
      const x0 = x(Math.min(v, 0));
      const w = Math.max(1, x(Math.max(v, 0)) - x0);
      const hl = opts.highlight !== undefined && (opts.highlight === cat || opts.highlight === s.name);
      const cls = hl ? 'hl' : singleSigned ? (v < 0 ? 'neg' : 'pos') : seriesClass(j);
      svg += `<rect class="bar ${cls}" x="${r(x0)}" y="${r(y0)}" width="${r(w)}" height="${r(barH - (multi ? 1 : 0))}"><title>${esc(`${cat}${multi ? ` · ${s.name}` : ''}: ${fmt(v)}`)}</title></rect>`;
      svg += v < 0 ? text(x0 - 6, y0 + barH / 2 + 4, fmt(v), `dl ${cls}`, 'end') : text(x0 + w + 6, y0 + barH / 2 + 4, fmt(v), `dl ${cls}`, 'start');
    });
  });
  svg += `<line class="zero" x1="${r(x(0))}" x2="${r(x(0))}" y1="${r(top)}" y2="${r(H - 6)}"/>`;
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d), singleSigned));
  if (key) svg += key.svg;
  return { svg, height: H };
}

function verticalRanges(data: ChartData, opts: ChartOptions, { width: W, height: H }: RenderSize, notes: Annotation[]): Body {
  const all = data.ranges.flatMap((g) => [g.low, g.high, ...(g.point === null ? [] : [g.point])]);
  const scale = niceScale(Math.min(...all, ...refValues(notes)), Math.max(...all, ...refValues(notes)), W < 500 ? 4 : 5);
  const tickLabels = scale.ticks.map((t) => formatNumber(t, scale.decimals));
  const left = Math.max(...tickLabels.map((l) => textWidth(l, 11))) + 12;
  const right = 6;
  const n = data.categories.length;
  const plotW = W - left - right;
  const step = plotW / n;
  const span = categorySpan(data.categories, left, step);
  const note = noteOf(notes);
  const noteG = note ? data.ranges.find((g) => g.key === note.from) : undefined;
  const noteV = noteG ? (note!.value ?? noteG.point ?? noteG.high) : 0;
  const bands = bandLabels(notes, span, left, W - right, leaderLane(noteG ? left + data.categories.indexOf(noteG.key) * step + step / 2 : undefined, (1 - scale.at(noteV)) * (H - 90)));
  const top = 20 + bands.height + notePad(notes) + markerPad(notes);
  const cats = categoryLabels(data.categories, step);
  const bottom = 10 + cats.height;
  const plotH = H - top - bottom;
  const y = (v: number) => top + (1 - scale.at(v)) * plotH;
  const barW = Math.min(step * 0.42, 26);
  const pointLabel = (g: Range) => formatNumber(g.point ?? 0, g.pointD);
  // Point labels sit to the right of the range bar, in the gap before the next category.
  const pointLabels = n <= 14 && step - barW - 8 >= Math.max(...data.ranges.map((g) => textWidth(pointLabel(g), 12)));
  const frame: Frame = {
    left,
    right: W - right,
    top,
    bottom: top + plotH,
    bandH: bands.height,
    width: W,
    horizontal: false,
    refLabels: 'right',
    value: y,
    span,
    anchor: (c, _series, value) => {
      const i = data.categories.indexOf(c);
      if (i < 0) return undefined;
      const g = data.ranges[i];
      return { x: left + i * step + step / 2, y: y(value ?? g.point ?? g.high) };
    },
  };
  let svg = bandLayer(notes, frame) + bands.render(top);
  for (const [i, t] of scale.ticks.entries()) {
    svg += `<line class="grid" x1="${r(left)}" x2="${r(W - right)}" y1="${r(y(t))}" y2="${r(y(t))}"/>`;
    svg += text(left - 8, y(t) + 4, tickLabels[i], 'ax', 'end');
  }
  data.ranges.forEach((g, i) => {
    const cx = left + i * step + step / 2;
    const hl = opts.highlight === g.key;
    const range = `${formatNumber(g.low, g.lowD)}–${formatNumber(g.high, g.highD)}`;
    svg += `<rect class="range${hl ? ' hl' : ''}" x="${r(cx - barW / 2)}" y="${r(y(g.high))}" width="${r(barW)}" height="${r(Math.max(1, y(g.low) - y(g.high)))}"><title>${esc(`${g.key}: ${range}`)}</title></rect>`;
    if (g.point !== null) {
      svg += `<circle class="dot ${hl ? 'hl' : 's1'}" cx="${r(cx)}" cy="${r(y(g.point))}" r="4"><title>${esc(`${g.key}: ${pointLabel(g)}`)}</title></circle>`;
      if (pointLabels) svg += text(cx + barW / 2 + 4, y(g.point) + 4, pointLabel(g), `dl ${hl ? 'hl' : 's1'}`, 'start');
    }
    if (cats.shown(i)) svg += axisText(cx, top + plotH + 16, cats.lines[i], W);
  });
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d)));
  return { svg, height: H, thinned: cats.every > 1 };
}

function horizontalRanges(data: ChartData, opts: ChartOptions, { width: W }: RenderSize, notes: Annotation[]): Body {
  const low = (g: Range) => formatNumber(g.low, g.lowD);
  const high = (g: Range) => formatNumber(g.high, g.highD);
  const refs = refValues(notes);
  const all = data.ranges.flatMap((g) => [g.low, g.high]).concat(refs);
  const extent = Math.max(...all) - Math.min(...all) || 1;
  const lo = Math.min(...all) - extent * 0.02;
  const hi = Math.max(...all) + extent * 0.02;
  const lowLabel = Math.max(...data.ranges.map((g) => textWidth(low(g), 12))) + 8;
  const highLabel = Math.max(...data.ranges.map((g) => textWidth(high(g), 12))) + 8;
  const catMax = W * 0.36;
  const catLines = data.categories.map((c) => wrapLabel(c, catMax, 11, false).map((l) => fitPlain(l, catMax, 11)));
  const catW = Math.min(catMax, Math.max(...catLines.flat().map((l) => textWidth(l, 11))));
  const left = catW + 14 + lowLabel;
  const right = highLabel + 4;
  const top = 6 + (refs.length ? 5 + 13 * refs.length : 0) + notePad(notes);
  const rowH = 30 + (catLines.some((l) => l.length > 1) ? 4 : 0);
  const H = top + rowH * data.categories.length + 6;
  const plotW = W - left - right;
  const x = (v: number) => left + ((v - lo) / (hi - lo)) * plotW;
  const barH = rowH * 0.5;
  const frame: Frame = {
    left,
    right: W - right,
    top,
    bottom: H - 6,
    bandH: 0,
    width: W,
    horizontal: true,
    refLabels: 'right',
    value: x,
    anchor: (c, _series, value) => {
      const i = data.categories.indexOf(c);
      if (i < 0) return undefined;
      const g = data.ranges[i];
      const at = x(value ?? g.point ?? g.high);
      // Beside the range, past its high label.
      return { x: at, y: top + i * rowH + rowH / 2, place: 'side', gap: Math.max(0, x(g.high) - at) + textWidth(high(g), 12) + 14, prefer: 'right' };
    },
  };
  let svg = '';
  data.ranges.forEach((g, i) => {
    const cy = top + i * rowH + rowH / 2;
    const hl = opts.highlight === g.key;
    svg += text(catW + 2, cy + 4 - (catLines[i].length - 1) * 6, catLines[i], 'ax cat', 'end');
    svg += `<rect class="range${hl ? ' hl' : ''}" x="${r(x(g.low))}" y="${r(cy - barH / 2)}" width="${r(Math.max(1, x(g.high) - x(g.low)))}" height="${r(barH)}"><title>${esc(`${g.key}: ${low(g)}–${high(g)}`)}</title></rect>`;
    svg += text(x(g.low) - 6, cy + 4, low(g), `dl${hl ? ' hl' : ''}`, 'end');
    svg += text(x(g.high) + 6, cy + 4, high(g), `dl${hl ? ' hl' : ''}`, 'start');
    if (g.point !== null) svg += `<circle class="dot ${hl ? 'hl' : 's1'}" cx="${r(x(g.point))}" cy="${r(cy)}" r="4"><title>${esc(`${g.key}: ${formatNumber(g.point, g.pointD)}`)}</title></circle>`;
  });
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d)));
  return { svg, height: H };
}

function scatterPlot(data: ChartData, opts: ChartOptions, { width: W, height: H }: RenderSize, notes: Annotation[]): Body {
  const pts = data.scatter;
  const xs = niceScale(Math.min(...pts.map((p) => p.x), 0), Math.max(...pts.map((p) => p.x)), W < 500 ? 4 : 6);
  const ys = niceScale(Math.min(...pts.map((p) => p.y), 0, ...refValues(notes)), Math.max(...pts.map((p) => p.y), ...refValues(notes)), W < 500 ? 4 : 5);
  const yTicks = ys.ticks.map((t) => formatNumber(t, ys.decimals, data.signed));
  const left = Math.max(...yTicks.map((l) => textWidth(l, 11))) + 12;
  const right = 14;
  const top = 18 + notePad(notes);
  const bottom = 26;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const px = (v: number) => left + xs.at(v) * plotW;
  const py = (v: number) => top + (1 - ys.at(v)) * plotH;
  const maxSize = Math.max(0, ...pts.map((p) => p.size ?? 0));
  const radius = (p: ScatterPoint) => (p.size !== null && maxSize > 0 ? 4 + 14 * Math.sqrt(p.size / maxSize) : 5);
  // Larger bubbles first so smaller ones stay visible on top; labels avoid bubbles and the zero axes.
  const ordered = [...pts].sort((a, b) => radius(b) - radius(a));
  const bubbles: Box[] = ordered.map((p) => ({ x0: px(p.x) - radius(p), x1: px(p.x) + radius(p), y0: py(p.y) - radius(p), y1: py(p.y) + radius(p) }));
  const axes: Box[] = [];
  if (xs.lo < 0 && xs.hi > 0) axes.push({ x0: px(0) - 1, x1: px(0) + 1, y0: top, y1: top + plotH });
  if (ys.lo < 0 && ys.hi > 0) axes.push({ x0: left, x1: left + plotW, y0: py(0) - 1, y1: py(0) + 1 });
  const labels: Box[] = [];
  const frame: Frame = {
    left,
    right: left + plotW,
    top,
    bottom: top + plotH,
    bandH: 0,
    width: W,
    horizontal: false,
    refLabels: 'right',
    value: py,
    hits: (box) => [...bubbles, ...labels].some((b) => overlaps(b, box)),
    anchor: (label, _series, value) => {
      const p = pts.find((q) => q.label === label);
      return p ? { x: px(p.x), y: py(value ?? p.y) } : undefined;
    },
  };
  let svg = '';
  for (const [i, t] of ys.ticks.entries()) {
    svg += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${r(left)}" x2="${r(left + plotW)}" y1="${r(py(t))}" y2="${r(py(t))}"/>`;
    svg += text(left - 8, py(t) + 4, yTicks[i], 'ax', 'end');
  }
  for (const t of xs.ticks) svg += axisText(px(t), top + plotH + 16, formatNumber(t, xs.decimals), W);
  if (xs.lo < 0 && xs.hi > 0) svg += `<line class="zero" x1="${r(px(0))}" x2="${r(px(0))}" y1="${r(top)}" y2="${r(top + plotH)}"/>`;
  for (const p of ordered) {
    const hl = opts.highlight === p.label;
    const tip = `${p.label ? `${p.label}: ` : ''}${formatNumber(p.x, data.xDecimals)}, ${formatNumber(p.y, data.decimals, data.signed)}`;
    svg += `<circle class="dot bubble ${hl ? 'hl' : 's2'}" cx="${r(px(p.x))}" cy="${r(py(p.y))}" r="${r(radius(p))}"><title>${esc(tip)}</title></circle>`;
  }
  for (const p of pts) {
    if (!p.label) continue;
    const hl = opts.highlight === p.label;
    const w = textWidth(p.label, 11, false) + 2;
    const cx = px(p.x);
    const cy = py(p.y);
    const rad = radius(p);
    const own = (b: Box) => Math.abs(b.x0 + b.x1 - 2 * cx) < 1 && Math.abs(b.y0 + b.y1 - 2 * cy) < 1;
    const options: [number, number, string][] = [
      [cx + rad + 3, cy + 4, 'start'],
      [cx - rad - 3, cy + 4, 'end'],
      [cx, cy - rad - 4, 'middle'],
      [cx, cy + rad + 12, 'middle'],
    ];
    for (const [lx, ly, anchor] of options) {
      const box = labelBox(lx, ly, w, anchor);
      if (box.x0 < left || box.x1 > W || box.y0 < 0 || box.y1 > H) continue;
      if ([...bubbles.filter((b) => !own(b)), ...axes, ...labels].some((b) => overlaps(b, box))) continue;
      labels.push(box);
      svg += text(lx, ly, p.label, `pt-lbl${hl ? ' hl' : ''}`, anchor);
      break;
    }
  }
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d), data.signed));
  return { svg, height: H };
}

function lineOrPoints(data: ChartData, opts: ChartOptions, { width: W, height: H }: RenderSize, notes: Annotation[]): Body {
  const isLine = opts.type === 'line';
  const multi = data.series.length > 1;
  // Labels keep each series' own decimals ($3.25B next to $168.9B); the axis has its own.
  const valueOf = (v: number, s: Series) => formatNumber(v, s.decimals, data.signed);
  const values = data.series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  const refs = refValues(notes);
  let min = Math.min(...values, ...refs);
  let max = Math.max(...values, ...refs);
  const log = opts.scale === 'log';
  if (!log && min > 0 && min / max < 0.35) min = 0;
  if (!log && max < 0 && max / min < 0.35) max = 0;
  const scale = log ? logScale(min, max) : niceScale(min, max, W < 500 ? 4 : 5);
  const tickLabels = scale.ticks.map((t) => formatNumber(t, scale.decimals, data.signed));
  // Direct labels at the right end of each line. A name that does not fit beside its value goes on a line above it.
  const labelRoom = W * 0.35;
  const endLabels = isLine
    ? data.series.map((s) => {
        const last = [...s.points].reverse().find((p) => p.y !== null)!;
        const value = valueOf(last.y!, s);
        if (!multi) return { s, last, lines: [value] };
        const one = `${s.name} ${value}`;
        if (textWidth(one, 12, false) <= labelRoom - 16) return { s, last, lines: [one] };
        return { s, last, lines: [fitPlain(s.name, labelRoom - 8, 12) || s.name, value] };
      })
    : [];
  const left = Math.max(...tickLabels.map((l) => textWidth(l, 11))) + 12;
  const right = isLine ? Math.min(labelRoom, Math.max(...endLabels.flatMap((e) => e.lines.map((l) => textWidth(l, 12, false)))) + 16) : 14;
  const plotW = W - left - right;
  const pad = isLine ? 0 : 14;
  // Horizontal geometry first: band labels need it to decide how much room they take above the plot.
  let xOf: (p: Point) => number;
  let span: Span;
  let xt: (t: number) => number = () => 0;
  let t0 = 0;
  let t1 = 0;
  const step = plotW / data.categories.length;
  if (data.xKind === 'time') {
    const ts = data.series.flatMap((s) => s.points.map((p) => p.t!));
    t0 = Math.min(...ts);
    t1 = Math.max(...ts);
    // A single date sits in the middle of the plot.
    xt = (t: number) => (t1 === t0 ? left + plotW / 2 : left + pad + ((t - t0) / (t1 - t0)) * (plotW - 2 * pad));
    xOf = (p) => xt(p.t!);
    span = (key) => {
      const x = xt(Math.min(Math.max(dateValue(key), t0), t1));
      return [x, x];
    };
  } else {
    xOf = (p) => left + (data.categories.indexOf(p.key) + 0.5) * step;
    span = categorySpan(data.categories, left, step);
  }
  const note = noteOf(notes);
  const noteSeries = note ? (data.series.find((q) => q.name === note.series) ?? data.series[0]) : undefined;
  const notePoint = note && noteSeries ? nearestPoint(noteSeries, note.from!, data.xKind) : undefined;
  const noteV = note?.value ?? notePoint?.y ?? max;
  const bands = bandLabels(notes, span, left, left + plotW, leaderLane(notePoint ? xOf(notePoint) : undefined, (1 - scale.at(Math.max(noteV, log ? scale.lo : noteV))) * (H - 90)));
  // Points have no direct labels per series, so several point series get a legend.
  const key = !isLine && multi ? legend(data.series, left, 12, W - right, opts.highlight) : undefined;
  const top = (key ? 20 + 18 * key.rows : 18) + bands.height + notePad(notes) + markerPad(notes);
  const cats = data.xKind === 'category' ? categoryLabels(data.categories, step) : undefined;
  const bottom = cats ? 12 + cats.height : 34;
  const plotH = H - top - bottom;
  const y = (v: number) => top + (1 - scale.at(v)) * plotH;
  let axis = '';
  for (const [i, t] of scale.ticks.entries()) {
    axis += `<line class="${t === 0 ? 'zero' : 'grid'}" x1="${r(left)}" x2="${r(left + plotW)}" y1="${r(y(t))}" y2="${r(y(t))}"/>`;
    axis += text(left - 8, y(t) + 4, tickLabels[i], 'ax', 'end');
  }
  if (data.xKind === 'time') {
    for (const tick of timeTicks(t0, t1, Math.max(2, Math.floor(plotW / 62)))) {
      axis += axisText(xt(tick.t), top + plotH + 16, tick.sub ? [tick.label, tick.sub] : tick.label, W);
    }
  } else {
    data.categories.forEach((_, i) => {
      if (cats!.shown(i)) axis += axisText(left + (i + 0.5) * step, top + plotH + 16, cats!.lines[i], W);
    });
  }
  // Everything a label could cover: point markers, point value labels and the line segments.
  const placed: Box[] = [];
  /** Kept free of value labels for the note's own leader and label. */
  let noteRoom: Box | undefined;
  const segments: [number, number, number, number][] = [];
  for (const s of data.series) {
    let prev: Point | undefined;
    for (const p of s.points) {
      if (p.y === null) {
        prev = undefined;
        continue;
      }
      if (isLine && prev) segments.push([xOf(prev), y(prev.y!), xOf(p), y(p.y)]);
      if (!isLine) placed.push({ x0: xOf(p) - 5, x1: xOf(p) + 5, y0: y(p.y) - 5, y1: y(p.y) + 5 });
      prev = p;
    }
  }
  const frame: Frame = {
    left,
    right: left + plotW,
    top,
    bottom: top + plotH,
    bandH: bands.height,
    width: W,
    horizontal: false,
    refLabels: 'left',
    value: y,
    span,
    hits: (box) => placed.some((b) => b !== noteRoom && overlaps(b, box)) || segments.some(([a, b, c, d]) => segmentHits(a, b, c, d, box)),
    anchor: (k, series, value) => {
      const s = data.series.find((q) => q.name === series) ?? data.series[0];
      const p = nearestPoint(s, k, data.xKind);
      if (p) return { x: xOf(p), y: y(value ?? p.y!) };
      if (value !== undefined && span(k)) return { x: (span(k)![0] + span(k)![1]) / 2, y: y(value) };
      return undefined;
    },
  };
  let svg = bandLayer(notes, frame) + bands.render(top) + axis;
  // Point labels sit above their point, or below it when that would collide; otherwise the tooltip carries the value.
  const placeLabel = (cx: number, cy: number, label: string): number | undefined => {
    const w = textWidth(label, 12) + 4;
    for (const ty of [cy - 9, cy + 19]) {
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: ty - 11, y1: ty + 2 };
      if (box.y0 < 0 || box.y1 > H) continue;
      if (!placed.some((b) => overlaps(b, box))) {
        placed.push(box);
        return ty;
      }
    }
    return undefined;
  };
  if (!isLine && note) {
    // Keep the note's ring, leader and label clear of the value labels.
    const at = frame.anchor(note.from!, note.series, note.value);
    if (at) placed.push((noteRoom = { x0: at.x - 8, x1: at.x + 8, y0: at.y - 36, y1: at.y + 8 }));
  }
  // The emphasised series is drawn with the lead weight; without a highlight, the first series leads.
  const lead = opts.highlight !== undefined && data.series.some((s) => s.name === opts.highlight) ? opts.highlight : data.series[0].name;
  data.series.forEach((s, j) => {
    const hl = opts.highlight !== undefined && opts.highlight === s.name;
    const cls = hl ? 'hl' : seriesClass(j);
    if (isLine) {
      let d = '';
      let pen = false;
      s.points.forEach((p, i) => {
        if (p.y === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${r(xOf(p))} ${r(y(p.y))}`;
        pen = true;
        // A value with a gap on both sides has no segment, so it gets a marker.
        if ((s.points[i - 1]?.y ?? null) === null && (s.points[i + 1]?.y ?? null) === null) {
          svg += `<circle class="dot ${cls}" cx="${r(xOf(p))}" cy="${r(y(p.y))}" r="2.5"/>`;
        }
      });
      svg += `<path class="ln ${cls}${s.name === lead ? ' lead' : ''}" d="${d}"/>`;
    }
    for (const p of s.points) {
      if (p.y === null) continue;
      const tip = `${p.key}${multi ? ` · ${s.name}` : ''}: ${valueOf(p.y, s)}`;
      svg += `<circle class="${isLine ? 'hit' : `dot ${cls}`}" cx="${r(xOf(p))}" cy="${r(y(p.y))}" r="${isLine ? 7 : 4.5}"><title>${esc(tip)}</title></circle>`;
      if (!isLine && s.points.length <= 14) {
        const ty = placeLabel(xOf(p), y(p.y), valueOf(p.y, s));
        if (ty !== undefined) svg += text(xOf(p), ty, valueOf(p.y, s), `dl ${cls}`);
      }
    }
  });
  if (isLine) {
    const ends = endLabels.map((e, j) => ({ ...e, j, ty: y(e.last.y!) + 4 - (e.lines.length - 1) * 6 })).sort((a, b) => a.ty - b.ty);
    for (let i = 1; i < ends.length; i++) ends[i].ty = Math.max(ends[i].ty, ends[i - 1].ty + 14 * ends[i - 1].lines.length);
    const last = ends[ends.length - 1];
    const overflow = last ? last.ty + 13 * (last.lines.length - 1) - (top + plotH + 4) : 0;
    if (overflow > 0) ends.forEach((p) => (p.ty -= overflow));
    for (const p of ends) {
      const cls = opts.highlight === p.s.name ? 'hl' : seriesClass(p.j);
      svg += `<circle class="dot ${cls}" cx="${r(xOf(p.last))}" cy="${r(y(p.last.y!))}" r="3"/>`;
      svg += text(left + plotW + 8, p.ty, p.lines, `dl ${cls}`, 'start', 13);
      for (const [i, l] of p.lines.entries()) placed.push(labelBox(left + plotW + 8, p.ty + 13 * i, textWidth(l, 12, false), 'start', 12));
    }
  }
  svg += markLayer(notes, frame, (v, d = 0) => formatNumber(v, Math.max(data.decimals, d), data.signed));
  if (key) svg += key.svg;
  return { svg, height: H };
}

/** The observation a note at key points to: the exact point, or on a time axis the nearest observation. */
function nearestPoint(s: Series, key: string, xKind: ChartData['xKind']): Point | undefined {
  const exact = s.points.find((q) => q.key === key && q.y !== null);
  if (exact || xKind !== 'time') return exact;
  const t = dateValue(key);
  return s.points.filter((q) => q.y !== null).sort((a, b) => Math.abs(a.t! - t) - Math.abs(b.t! - t))[0];
}
