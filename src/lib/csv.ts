// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines).
import fs from 'node:fs';

export interface CsvTable {
  columns: string[];
  rows: Record<string, string>[];
}

/** Columns holding space-separated citation IDs from references.yaml. */
export const SOURCE_ID_COLUMN = /^source_ids?$/i;

export function parseCsv(text: string): CsvTable {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) throw new Error('file is empty');
  const columns = nonEmpty[0].map((c) => c.trim());
  columns.forEach((c, i) => {
    if (!c) throw new Error(`column ${i + 1} has no header`);
    if (columns.indexOf(c) !== i) throw new Error(`column header "${c}" appears more than once`);
  });
  const rows = nonEmpty.slice(1).map((r, idx) => {
    if (r.length > columns.length) throw new Error(`row ${idx + 2} has ${r.length} fields, header has ${columns.length}`);
    return Object.fromEntries(columns.map((c, j) => [c, (r[j] ?? '').trim()]));
  });
  return { columns, rows };
}

/** Load tabular data from a .csv or .json (array of flat objects) file. */
export function loadTable(file: string): CsvTable {
  const text = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    if (!Array.isArray(data) || !data.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      throw new Error('JSON data must be an array of objects');
    }
    const columns = [...new Set(data.flatMap((r) => Object.keys(r)))];
    const rows = data.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] == null ? '' : String(r[c])])));
    return { columns, rows };
  }
  return parseCsv(text);
}

/** Parse a CSV/JSON cell as a number; empty or non-numeric gives null. */
export function toNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const v = value.trim().replace(/−/g, '-');
  if (v === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return null;
  return Number(v);
}
