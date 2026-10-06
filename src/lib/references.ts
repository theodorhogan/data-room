// Package-local bibliography: references.yaml maps citation IDs to sources.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { REFERENCES_FILE, type Issue } from './packages.ts';

const KNOWN_FIELDS = ['title', 'publisher', 'author', 'date', 'url', 'note'] as const;

const referenceSchema = z.looseObject({
  title: z.string().trim().min(1, 'title is required'),
  publisher: z.string().optional(),
  author: z.union([z.string(), z.array(z.string())]).optional(),
  date: z.union([z.string(), z.number()]).optional(),
  url: z.url({ protocol: /^https?$/, error: 'url must be an absolute http(s) URL' }).optional(),
  note: z.string().optional(),
});

export const CITATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export interface Reference {
  id: string;
  title: string;
  publisher?: string;
  author?: string;
  date?: string;
  url?: string;
  note?: string;
}

export function loadReferences(pkgDir: string): { refs: Map<string, Reference>; issues: Issue[] } {
  const refs = new Map<string, Reference>();
  const issues: Issue[] = [];
  const file = path.join(pkgDir, REFERENCES_FILE);
  if (!fs.existsSync(file)) return { refs, issues };
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'), { uniqueKeys: true, prettyErrors: true });
  for (const err of doc.errors) {
    const pos = err.linePos?.[0];
    issues.push({ level: 'error', file: REFERENCES_FILE, line: pos?.line, column: pos?.col, message: `invalid YAML: ${err.message.split('\n')[0]}` });
  }
  if (issues.length) return { refs, issues };
  const data = doc.toJS() ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    issues.push({ level: 'error', file: REFERENCES_FILE, message: 'references must be a mapping of citation IDs to sources' });
    return { refs, issues };
  }
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    if (!CITATION_ID_PATTERN.test(id)) {
      issues.push({ level: 'error', file: REFERENCES_FILE, message: `"${id}" is not a valid citation ID` });
      continue;
    }
    const parsed = referenceSchema.safeParse(value);
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        issues.push({ level: 'error', file: REFERENCES_FILE, message: `${id}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}` });
      }
      continue;
    }
    const extra = Object.keys(parsed.data).filter((k) => !(KNOWN_FIELDS as readonly string[]).includes(k));
    if (extra.length) {
      issues.push({ level: 'warning', file: REFERENCES_FILE, message: `${id}: unknown field(s) ${extra.join(', ')} are ignored` });
    }
    const r = parsed.data;
    refs.set(id, {
      id,
      title: r.title,
      publisher: r.publisher,
      author: Array.isArray(r.author) ? r.author.join(', ') : r.author,
      date: r.date == null ? undefined : String(r.date),
      url: r.url,
      note: r.note,
    });
  }
  return { refs, issues };
}
