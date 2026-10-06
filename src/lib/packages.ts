// Reads publication packages from disk. Plain Node code: shared by the site build and the CLI scripts.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { manifestSchema, type Manifest } from './manifest.ts';

export const MANIFEST_FILE = 'manifest.yaml';
export const REFERENCES_FILE = 'references.yaml';

export interface Issue {
  level: 'error' | 'warning';
  message: string;
  /** Path relative to the package directory. */
  file?: string;
  line?: number;
  column?: number;
}

export interface PackageData {
  /** Absolute package directory. */
  dir: string;
  /** Folder name under content/. */
  name: string;
  manifest?: Manifest;
  /** Files inside the package, as sorted POSIX paths relative to `dir`. */
  files: string[];
  issues: Issue[];
}

export function contentDirectory(root = process.cwd()): string {
  return path.join(root, 'content');
}

export function listPackageDirs(contentDir: string): string[] {
  if (!fs.existsSync(contentDir)) return [];
  return fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => path.join(contentDir, d.name))
    .sort();
}

/** Recursively list package files. Symlinks are reported (they could point outside the package). */
export function listFiles(dir: string): { files: string[]; issues: Issue[] } {
  const files: string[] = [];
  const issues: Issue[] = [];
  const walk = (abs: string, rel: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        issues.push({ level: 'error', file: relPath, message: 'symbolic links are not allowed in a publication package' });
      } else if (entry.name.startsWith('.')) {
        issues.push({ level: 'warning', file: relPath, message: 'hidden file is ignored and should be removed' });
      } else if (entry.isDirectory()) {
        walk(path.join(abs, entry.name), relPath);
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  };
  walk(dir, '');
  return { files: files.sort(), issues };
}

export function parseManifest(text: string): { manifest?: Manifest; data?: Record<string, unknown>; issues: Issue[] } {
  const issues: Issue[] = [];
  const doc = YAML.parseDocument(text, { uniqueKeys: true, prettyErrors: true });
  for (const err of doc.errors) {
    const pos = err.linePos?.[0];
    issues.push({ level: 'error', file: MANIFEST_FILE, line: pos?.line, column: pos?.col, message: `invalid YAML: ${err.message.split('\n')[0]}` });
  }
  if (issues.length) return { issues };
  const data = doc.toJS();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    issues.push({ level: 'error', file: MANIFEST_FILE, message: 'manifest must be a YAML mapping' });
    return { issues };
  }
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      issues.push({ level: 'error', file: MANIFEST_FILE, message: `${where}${issue.message}` });
    }
    return { data, issues };
  }
  return { manifest: result.data, data, issues };
}

export function readPackage(dir: string): PackageData {
  const name = path.basename(dir);
  const { files, issues } = listFiles(dir);
  const manifestPath = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    issues.push({ level: 'error', message: `missing ${MANIFEST_FILE}` });
    return { dir, name, files, issues };
  }
  const parsed = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
  issues.push(...parsed.issues);
  return { dir, name, manifest: parsed.manifest, files, issues };
}

/** Resolve a package-relative reference such as "./chart-01.csv"; undefined if it escapes the package. */
export function resolveInPackage(pkgDir: string, ref: string): string | undefined {
  if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/') || ref.includes('\\')) return undefined;
  const abs = path.resolve(pkgDir, ref);
  const rel = path.relative(pkgDir, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return abs;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
