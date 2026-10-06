// Site registry: every publication package in content/, resolved to URLs.
import fs from 'node:fs';
import path from 'node:path';
import { typeLabel, type Manifest } from './manifest.ts';
import { contentDirectory, listPackageDirs, readPackage } from './packages.ts';
import { publicationRefsIn } from './research-mdx.ts';

export interface Publication {
  id: string;
  manifest: Manifest;
  dir: string;
  files: string[];
  /** Site path without base, e.g. /research/<id>/ — derived from kind. */
  path: string;
  typeLabel: string;
  year: string;
  /** IDs referenced with <PublicationRef> in research MDX. */
  references: string[];
  readingMinutes?: number;
  /** Research MDX only: the PDF offered for download, the package's own (manifest `pdf`) or the generated A4 print. */
  pdfFile?: string;
}

let cache: Publication[] | undefined;
let cacheKey = '';

/**
 * In dev, what the registry depends on: each package's folders (their modification times change when files are added,
 * removed or renamed), its manifest and its primary file. Cheap to check, so a page with many exhibits does not re-read
 * every package once per exhibit, while content edits still show up on the next request.
 */
function contentKey(): string {
  const stamp = (f: string) => {
    try {
      return fs.statSync(f).mtimeMs;
    } catch {
      return 0;
    }
  };
  const folders = (dir: string): string[] => [
    `${dir}:${stamp(dir)}`,
    ...fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => folders(path.join(dir, e.name))),
  ];
  return listPackageDirs(contentDirectory())
    .map((dir) => {
      const primary = cache?.find((p) => p.dir === dir)?.manifest.primary;
      return [...folders(dir), stamp(path.join(dir, 'manifest.yaml')), primary ? stamp(path.join(dir, primary)) : ''].join(',');
    })
    .join('|');
}

export function getPublications(): Publication[] {
  if (cache && import.meta.env.PROD) return cache;
  const key = import.meta.env.PROD ? '' : contentKey();
  if (cache && key === cacheKey) return cache;
  const pubs: Publication[] = [];
  const problems: string[] = [];
  for (const dir of listPackageDirs(contentDirectory())) {
    const pkg = readPackage(dir);
    const m = pkg.manifest;
    const errors = pkg.issues.filter((i) => i.level === 'error');
    if (!m || errors.length || m.id !== pkg.name) {
      problems.push(`content/${pkg.name}: ${errors.map((e) => e.message).join('; ') || `id "${m?.id}" must match the folder name`}`);
      continue;
    }
    const pub: Publication = {
      id: m.id,
      manifest: m,
      dir,
      files: pkg.files,
      path: `/${m.kind}/${m.id}/`,
      typeLabel: typeLabel(m),
      year: m.date.slice(0, 4),
      references: [],
    };
    if (m.format === 'mdx') {
      const source = fs.readFileSync(path.join(dir, m.primary), 'utf8');
      pub.references = publicationRefsIn(source);
      const words = source.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
      pub.readingMinutes = Math.max(1, Math.round(words / 230));
      pub.pdfFile = m.pdf ?? `${m.id}.pdf`;
    }
    pubs.push(pub);
  }
  if (problems.length) {
    throw new Error(`Invalid publication packages (run npm run publication:validate):\n${problems.join('\n')}`);
  }
  pubs.sort((a, b) => b.manifest.date.localeCompare(a.manifest.date) || a.manifest.title.localeCompare(b.manifest.title));
  cache = pubs;
  cacheKey = key;
  return pubs;
}

export function getPublication(id: string): Publication | undefined {
  return getPublications().find((p) => p.id === id);
}

/** Prefix a site path with the configured base. */
export function url(sitePath: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + sitePath;
}

export function fileUrl(pub: Publication, file: string): string {
  return url(pub.path + file.split('/').map(encodeURIComponent).join('/'));
}

/** Absolute URL when `site` is configured (used in print), otherwise the base-prefixed path. */
export function absoluteUrl(sitePath: string, site: URL | undefined): string {
  return site ? new URL(url(sitePath), site).href : url(sitePath);
}

/**
 * `related` works in both directions (declared here or by the other publication);
 * `referencedIn` lists research that cites this publication with <PublicationRef>.
 */
export function relationsOf(pub: Publication): { related: Publication[]; referencedIn: Publication[] } {
  const others = getPublications().filter((p) => p.id !== pub.id);
  const related = others.filter((p) => pub.manifest.related.includes(p.id) || p.manifest.related.includes(pub.id));
  const referencedIn = others.filter((p) => p.references.includes(pub.id) && !related.includes(p));
  return { related, referencedIn };
}
