// Publication package validation, shared by `publication:validate` and `publication:add`.
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { VFile } from 'vfile';
import { bundleArtifact } from './artifact-bundle.ts';
import { FORMAT_EXTENSION, isSafeRelativePath, PACKAGE_FILE_TYPES, type Manifest } from './manifest.ts';
import { listPackageDirs, MANIFEST_FILE, readPackage, type Issue } from './packages.ts';
import { remarkResearch } from './research-mdx.ts';
import { readWorkbook } from './workbook.ts';

export interface PackageReport {
  name: string;
  dir: string;
  manifest?: Manifest;
  files: string[];
  issues: Issue[];
}

export interface ValidateOptions {
  contentDir: string;
  /** IDs that `related` and <PublicationRef> may point to. */
  knownIds: Set<string>;
  /** Folder name the ID must equal (defaults to the package folder). */
  expectedId?: string;
  /** The importer reports unknown cross-references as warnings (the target may be imported next). */
  missingRefs?: 'error' | 'warning';
}

// Active SVG content, matched after decoding character references: script-capable elements with any
// namespace prefix, embedded XHTML, event handlers, script URLs, and DTDs (entities can hide values).
const UNSAFE_SVG = /<(?:[\w.-]+:)?(?:script|foreignObject|iframe|object|embed)\b|http:\/\/www\.w3\.org\/1999\/xhtml|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|(?:java|vb)script:/i;

function unsafeSvg(text: string): boolean {
  const decoded = text.replace(/&#(x?)([0-9a-f]+);?/gi, (_, hex: string, n: string) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)));
  return UNSAFE_SVG.test(decoded.replace(/\s+(?=[a-z]*:)/gi, ''));
}

/** Per-file rules: allowed types, scripts only in JSX packages, one MDX file, safe SVG, reserved names. */
function checkFiles(dir: string, files: string[], m: Manifest, error: (message: string, file?: string) => void) {
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!isSafeRelativePath(f)) error(`file name "${f}" must start with a letter or digit and use only letters, digits, ".", "_" and "-"`);
    else if (f.split('/').includes('node_modules')) error(`"${f}": node_modules folders are not allowed in a package`);
    else if (!PACKAGE_FILE_TYPES[ext]) error(`"${f}": ${ext || 'extensionless'} files are not allowed (allowed: ${Object.keys(PACKAGE_FILE_TYPES).join(' ')})`);
    else if (ext === '.mdx' && f !== m.primary) error(`"${f}": only the primary file may be MDX`);
    else if ((ext === '.js' || ext === '.jsx') && m.format !== 'jsx') error(`"${f}": script files belong only in JSX artifact packages`);
    else if (ext === '.svg' && unsafeSvg(fs.readFileSync(path.join(dir, ...f.split('/')), 'utf8'))) {
      error(`"${f}": SVG files must not contain scripts, event handlers, javascript: links or embedded HTML`);
    } else if (m.format === 'mdx' && f === `${m.id}.pdf` && f !== m.pdf) error(`"${f}" is reserved for the generated A4 PDF`);
  }
}

export async function validatePackage(dir: string, opts: ValidateOptions): Promise<PackageReport> {
  const pkg = readPackage(dir);
  const issues = [...pkg.issues];
  const report: PackageReport = { name: pkg.name, dir, manifest: pkg.manifest, files: pkg.files, issues };
  const m = pkg.manifest;
  if (!m) return report;
  const error = (message: string, file?: string) => issues.push({ level: 'error', message, file });
  const warning = (message: string, file?: string) => issues.push({ level: 'warning', message, file });
  const missing = opts.missingRefs === 'warning' ? warning : error;

  const expectedId = opts.expectedId ?? pkg.name;
  if (m.id !== expectedId) error(`id "${m.id}" must equal the package folder name "${expectedId}"`, MANIFEST_FILE);
  if (!m.id.startsWith(m.date)) warning(`id starts with a different date than date: ${m.date}`, MANIFEST_FILE);
  if (m.format === 'mdx' && m.kind !== 'research') error('format mdx is the research report format; use kind: research', MANIFEST_FILE);

  checkFiles(dir, pkg.files, m, error);
  if (m.pdf !== undefined) {
    if (m.format !== 'mdx') error('pdf applies only to research reports (format mdx)', MANIFEST_FILE);
    else if (!m.pdf.toLowerCase().endsWith('.pdf')) error(`pdf "${m.pdf}" must be a .pdf file`, MANIFEST_FILE);
    else if (!pkg.files.includes(m.pdf)) error(`pdf file "${m.pdf}" does not exist in the package`, MANIFEST_FILE);
    else if (!fs.readFileSync(path.join(dir, ...m.pdf.split('/'))).subarray(0, 5).equals(Buffer.from('%PDF-'))) error('pdf is not a PDF file', m.pdf);
  }

  for (const [field, values] of [['tags', m.tags as string[]], ['tickers', m.tickers], ['related', m.related]] as const) {
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    if (dupes.length) warning(`${field} lists ${[...new Set(dupes)].join(', ')} more than once`, MANIFEST_FILE);
  }
  for (const id of m.related) {
    if (id === m.id) warning('related lists the publication itself', MANIFEST_FILE);
    else if (!opts.knownIds.has(id)) missing(`related publication "${id}" does not exist`, MANIFEST_FILE);
  }

  const primary = path.join(dir, ...m.primary.split('/'));
  if (!pkg.files.includes(m.primary)) {
    error(`primary file "${m.primary}" does not exist in the package`, MANIFEST_FILE);
    return report;
  }
  if (!m.primary.toLowerCase().endsWith(FORMAT_EXTENSION[m.format])) {
    error(`primary "${m.primary}" must be a ${FORMAT_EXTENSION[m.format]} file for format ${m.format}`, MANIFEST_FILE);
    return report;
  }

  if (m.format === 'mdx') issues.push(...(await validateMdx(primary, dir, m, opts)));
  if (m.format === 'pdf' && !fs.readFileSync(primary).subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    error('primary is not a PDF file', m.primary);
  }
  if (m.format === 'xlsx') {
    try {
      await readWorkbook(primary);
    } catch (e) {
      error(`workbook cannot be read: ${(e as Error).message}`, m.primary);
    }
  }
  if (m.format === 'jsx') {
    try {
      await bundleArtifact(primary);
    } catch (e) {
      error(`artifact does not build: ${(e as Error).message}`, m.primary);
    }
  }
  return report;
}

async function validateMdx(file: string, dir: string, m: Manifest, opts: ValidateOptions): Promise<Issue[]> {
  const rel = path.relative(dir, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const vfile = new VFile({ path: file, value: text });
  const issues: Issue[] = [];
  // The site's MDX pipeline would read a frontmatter block (and could import a `layout`); metadata lives in manifest.yaml.
  if (/^﻿?---\r?\n/.test(text)) {
    return [{ level: 'error', file: rel, line: 1, message: 'frontmatter is not allowed; metadata belongs in manifest.yaml' }];
  }
  try {
    await compile(vfile, {
      remarkPlugins: [
        remarkGfm,
        [
          remarkResearch,
          { contentDir: opts.contentDir, packageDir: dir, packageId: m.id, knownIds: opts.knownIds, missingPublicationRefs: opts.missingRefs ?? 'error' },
        ],
      ],
    });
  } catch (e) {
    if (!vfile.messages.some((msg) => msg.fatal)) {
      const err = e as { reason?: string; message: string; line?: number; column?: number };
      issues.push({ level: 'error', file: rel, line: err.line, column: err.column, message: `MDX does not compile: ${err.reason ?? err.message}` });
    }
  }
  for (const msg of vfile.messages) {
    issues.push({ level: msg.fatal ? 'error' : 'warning', file: rel, line: msg.line ?? undefined, column: msg.column ?? undefined, message: msg.reason });
  }
  return issues;
}

/** Validate every package under content/, including cross-package rules. */
export async function validateContent(contentDir: string, only?: string[]): Promise<{ reports: PackageReport[]; stray: string[] }> {
  const dirs = listPackageDirs(contentDir);
  const stray = fs.existsSync(contentDir)
    ? fs.readdirSync(contentDir, { withFileTypes: true }).filter((d) => !d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)
    : [];
  const owners = new Map<string, string[]>();
  for (const dir of dirs) {
    const id = readPackage(dir).manifest?.id;
    if (id) owners.set(id, [...(owners.get(id) ?? []), path.basename(dir)]);
  }
  const knownIds = new Set(owners.keys());
  const selected = only?.length ? dirs.filter((d) => only.some((o) => path.resolve(o) === d)) : dirs;
  const reports: PackageReport[] = [];
  for (const dir of selected) {
    const report = await validatePackage(dir, { contentDir, knownIds });
    const id = report.manifest?.id;
    const dupes = id ? owners.get(id)!.filter((n) => n !== report.name) : [];
    if (dupes.length) report.issues.push({ level: 'error', file: MANIFEST_FILE, message: `id "${id}" is also used by ${dupes.join(', ')}` });
    reports.push(report);
  }
  return { reports, stray };
}

export function printIssues(reports: PackageReport[], log = console.log): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const r of reports) {
    const e = r.issues.filter((i) => i.level === 'error').length;
    errors += e;
    warnings += r.issues.length - e;
    const what = r.manifest ? ` (${r.manifest.kind}/${r.manifest.format})` : '';
    log(`${e ? '✗' : '✓'} ${r.name}${what}`);
    for (const i of r.issues) {
      const where = i.file ? `${i.file}${i.line ? `:${i.line}` : ''}: ` : '';
      log(`    ${i.level === 'error' ? 'error  ' : 'warning'} ${where}${i.message}`);
    }
  }
  return { errors, warnings };
}
