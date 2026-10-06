// Publication manifest v1 — the metadata contract of a publication package.
import { z } from 'zod';

export const KINDS = ['research', 'artifact'] as const;
export const FORMATS = ['mdx', 'pdf', 'xlsx', 'jsx'] as const;
export type Kind = (typeof KINDS)[number];
export type Format = (typeof FORMATS)[number];

export const FORMAT_EXTENSION: Record<Format, string> = {
  mdx: '.mdx',
  pdf: '.pdf',
  xlsx: '.xlsx',
  jsx: '.jsx',
};

/** YYYY-MM-DD-short-descriptive-slug: lowercase ASCII, hyphen-separated. */
export const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The topic tags (a fixed list) and how they are shown. A manifest may use either form. */
export const TAGS = {
  'deep-research': 'Deep Research',
  macro: 'Macro',
  'financial-model': 'Financial Model',
  dcf: 'DCF',
  cca: 'CCA',
  lbo: 'LBO',
  cta: 'CTA',
  trading: 'Trading',
  report: 'Report',
  'equity-research': 'Equity Research',
} as const;
export type Tag = keyof typeof TAGS;
export const TAG_SLUGS = Object.keys(TAGS) as Tag[];
export const tagLabel = (tag: string) => TAGS[tag as Tag] ?? tag;
/** Tags in the order of the list above, whatever order the manifest used. */
export const sortTags = (tags: readonly string[]) => [...tags].sort((a, b) => TAG_SLUGS.indexOf(a as Tag) - TAG_SLUGS.indexOf(b as Tag));
const toTagSlug = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().toLowerCase();
  return TAG_SLUGS.find((slug) => slug === v || TAGS[slug].toLowerCase() === v) ?? value;
};

/** Stock ticker of a public company: AAPL, BRK.B, or with an exchange suffix for non-US listings (RNO.PA, KGX.DE). */
export const TICKER_PATTERN = /^[A-Z0-9]{1,6}(?:\.[A-Z]{1,3})?$/;
/** One path segment of a file inside a package. */
export const FILE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * File types a package may contain, with the Content-Type the site serves them with.
 * Anything else (HTML, XML, executables…) is rejected: package files are published on the site origin.
 */
export const PACKAGE_FILE_TYPES: Record<string, string> = {
  '.yaml': 'text/yaml; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.js': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\')) return false;
  return p.split('/').every((seg) => FILE_SEGMENT_PATTERN.test(seg) && seg !== '..' && seg !== '.');
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const manifestSchema = z.strictObject({
  schema: z.literal(1, { error: 'schema must be 1' }),
  id: z
    .string()
    .regex(ID_PATTERN, 'id must look like YYYY-MM-DD-short-slug (lowercase ASCII, hyphen-separated)')
    .refine((id) => !ID_PATTERN.test(id) || isCalendarDate(id.slice(0, 10)), 'id must start with a real calendar date'),
  title: z.string().trim().min(1, 'title must not be empty'),
  date: z.string().refine(isCalendarDate, 'date must be a real calendar date in YYYY-MM-DD form'),
  kind: z.enum(KINDS, { error: `kind must be one of: ${KINDS.join(', ')}` }),
  format: z.enum(FORMATS, { error: `format must be one of: ${FORMATS.join(', ')}` }),
  primary: z.string().refine(isSafeRelativePath, 'primary must be a plain relative file path inside the package'),
  /** Research reports: a PDF in the package (such as the authors' original) offered for download instead of a generated A4 print. */
  pdf: z.string().refine(isSafeRelativePath, 'pdf must be a plain relative file path inside the package').optional(),
  summary: z.string().trim().min(1).optional(),
  authors: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  tags: z
    .array(z.preprocess(toTagSlug, z.enum(TAG_SLUGS, { error: `tags must come from the list: ${Object.values(TAGS).join(', ')}` })))
    .default([]),
  tickers: z
    .array(
      z
        .string()
        .trim()
        .transform((t) => t.toUpperCase())
        .pipe(z.string().regex(TICKER_PATTERN, 'tickers are stock symbols such as PRLB, BRK.B or RNO.PA')),
    )
    .default([]),
  related: z.array(z.string().regex(ID_PATTERN, 'related entries must be publication IDs')).default([]),
});

export type Manifest = z.infer<typeof manifestSchema>;

export function formatForExtension(file: string): Format | undefined {
  const lower = file.toLowerCase();
  return FORMATS.find((f) => lower.endsWith(FORMAT_EXTENSION[f]));
}

/** Human label for how a publication presents itself (derived from kind + format). */
export function typeLabel(m: Pick<Manifest, 'kind' | 'format'>): string {
  if (m.format === 'mdx') return 'Research report';
  if (m.format === 'pdf') return m.kind === 'research' ? 'Research PDF' : 'PDF document';
  if (m.format === 'xlsx') return 'Workbook';
  return 'Interactive artifact';
}
