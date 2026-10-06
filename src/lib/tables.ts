// Semantic emphasis for <Table> and the <KeyFigures> panel. Names come from the MDX props;
// the brand decides how each role looks.
import { toNumber, type CsvTable } from './csv.ts';

export interface TableHooks {
  highlight?: string;
  key: string[];
  changeColumns: string[];
  changeRows: string[];
  forecast: string[];
}

const names = (value: string | undefined) =>
  (value ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

/** Resolve <Table highlight/key/changes/forecast> against the table. Throws a readable Error for unknown names. */
export function tableHooks(table: CsvTable, props: { highlight?: string; key?: string; changes?: string; forecast?: string }): TableHooks {
  const rowLabels = table.rows.map((r) => r[table.columns[0]]);
  const columns = table.columns.slice(1);
  const rows = (prop: string, list: string[]) => {
    for (const n of list) if (!rowLabels.includes(n)) throw new Error(`${prop}: no row starts with "${n}" (rows: ${rowLabels.join(', ')})`);
    return list;
  };
  const highlight = names(props.highlight);
  if (highlight.length > 1) throw new Error('highlight: one row only (brand rule: one highlight per exhibit)');
  rows('highlight', highlight);
  const forecast = names(props.forecast);
  for (const n of forecast) if (!columns.includes(n)) throw new Error(`forecast: no column "${n}" (columns: ${columns.join(', ')})`);
  const changeColumns: string[] = [];
  const changeRows: string[] = [];
  for (const n of names(props.changes)) {
    if (columns.includes(n)) changeColumns.push(n);
    else if (rowLabels.includes(n)) changeRows.push(n);
    else throw new Error(`changes: "${n}" is neither a column nor a row label`);
  }
  return { highlight: highlight[0], key: rows('key', names(props.key)), changeColumns, changeRows, forecast };
}

export interface KeyFigure {
  label: string;
  value: string;
  note?: string;
  /** Sign of the value when it reads as a number (−8.9%, +12%, $(3.1)m). */
  sign?: 'pos' | 'neg';
}

/** Rows of a key-figures CSV (label,value[,note]). Throws a readable Error. */
export function keyFigures(table: CsvTable): KeyFigure[] {
  for (const col of ['label', 'value']) if (!table.columns.includes(col)) throw new Error(`key figures need a "${col}" column`);
  const extra = table.columns.filter((c) => !['label', 'value', 'note'].includes(c));
  if (extra.length) throw new Error(`unknown key-figure column(s): ${extra.join(', ')} (allowed: label, value, note)`);
  if (!table.rows.length) throw new Error('key figures need at least one row');
  if (table.rows.length > 8) throw new Error('keep key figures to 8 or fewer');
  return table.rows.map((row, i) => {
    if (!row.label?.trim() || !row.value?.trim()) throw new Error(`row ${i + 2}: label and value are required`);
    // A sign may follow a currency symbol ($-3.1m, $(3.1)m); a hyphen before a number becomes a true minus.
    const value = row.value.trim().replace(/^([$€£]?)-(?=[\d$€£.(])/, '$1−');
    const number = toNumber(value.replace(/[^\d.]/g, ''));
    const accounting = /^[$€£]?\(.*\)\S*$/.test(value);
    const negative = /^[$€£]?−/.test(value) || accounting;
    const signed = negative || /^[$€£]?\+/.test(value);
    return {
      label: row.label.trim(),
      value,
      note: row.note?.trim() || undefined,
      sign: signed && number !== null && number !== 0 ? (negative ? 'neg' : 'pos') : undefined,
    };
  });
}
