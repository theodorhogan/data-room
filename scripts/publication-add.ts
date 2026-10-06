// Import one publication package (a directory or a ZIP) into content/<id>/.
// Usage: npm run publication:add -- <package.zip | package-dir> [--replace]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { formatForExtension } from '../src/lib/manifest.ts';
import { contentDirectory, listFiles, listPackageDirs, MANIFEST_FILE, parseManifest, readPackage } from '../src/lib/packages.ts';
import { printIssues, validatePackage } from '../src/lib/validate.ts';

const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const input = args.find((a) => !a.startsWith('--'));
if (!input) fail('Usage: npm run publication:add -- <package.zip | package-dir> [--replace]');

/** Temp dirs are removed on every exit path, including fail() → process.exit(). */
function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Unpack a ZIP into a fresh temp directory, rejecting unsafe entry names. */
function unzipToTemp(zipFile: string): string {
  let total = 0;
  const entries = unzipSync(new Uint8Array(fs.readFileSync(zipFile)), {
    filter(entry) {
      total += entry.originalSize;
      if (total > MAX_UNZIPPED_BYTES) fail('ZIP expands to more than 500 MB');
      return !entry.name.endsWith('/') && !JUNK.test(entry.name);
    },
  });
  const tmp = tempDir('publication-add-');
  for (const [name, data] of Object.entries(entries)) {
    const clean = name.replace(/\\/g, '/');
    if (clean.startsWith('/') || /^[a-z]:/i.test(clean) || clean.split('/').includes('..')) fail(`unsafe path in ZIP: ${name}`);
    const target = path.join(tmp, ...clean.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
  return tmp;
}

/** The package root is the one folder holding manifest.yaml; everything else must live inside it. */
function findPackageRoot(dir: string): string {
  const { files } = listFiles(dir);
  const manifests = files.filter((f) => path.posix.basename(f) === MANIFEST_FILE);
  if (manifests.length === 0) fail(`no ${MANIFEST_FILE} found — a publication package needs one at its root`);
  if (manifests.length > 1) fail(`found ${manifests.length} ${MANIFEST_FILE} files; import exactly one publication package at a time`);
  const root = path.posix.dirname(manifests[0]);
  const outside = files.filter((f) => root !== '.' && !f.startsWith(`${root}/`));
  if (outside.length) fail(`files outside the package folder "${root}": ${outside.join(', ')}`);
  return root === '.' ? dir : path.join(dir, ...root.split('/'));
}

/** Deterministic normalisation: add `format` when it can only be one value. */
function normalizeManifest(root: string): string[] {
  const file = path.join(root, MANIFEST_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const { data } = parseManifest(text);
  if (!data || data.format !== undefined || typeof data.primary !== 'string') return [];
  const format = formatForExtension(data.primary);
  if (!format) return [];
  const line = `format: ${format}`;
  const next = /^kind:.*$/m.test(text) ? text.replace(/^(kind:.*)$/m, `$1\n${line}`) : `${text.trimEnd()}\n${line}\n`;
  fs.writeFileSync(file, next);
  return [`added "${line}" to ${MANIFEST_FILE} (inferred from primary ${data.primary})`];
}

const source = path.resolve(input);
if (!fs.existsSync(source)) fail(`not found: ${input}`);
const isZip = fs.statSync(source).isFile();
if (isZip && !source.toLowerCase().endsWith('.zip')) fail('expected a .zip file or a package directory');

console.log(`Importing ${path.basename(source)}`);
const staging = tempDir('publication-stage-');
{
  const unpacked = isZip ? unzipToTemp(source) : source;
  const root = findPackageRoot(unpacked);
  const pkgDir = path.join(staging, 'package');
  fs.cpSync(root, pkgDir, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(root, p).replace(/\\/g, '/');
      return !JUNK.test(rel) && !rel.split('/').some((seg) => seg.startsWith('.'));
    },
  });

  for (const note of normalizeManifest(pkgDir)) console.log(`  • ${note}`);
  const manifest = readPackage(pkgDir).manifest;
  const id = manifest?.id;
  if (id && path.basename(root) !== id && root !== unpacked) console.log(`  • package folder "${path.basename(root)}" differs from id; importing as ${id}`);

  const contentDir = contentDirectory();
  const knownIds = new Set(listPackageDirs(contentDir).map((d) => path.basename(d)));
  if (id) knownIds.add(id);
  const report = await validatePackage(pkgDir, { contentDir, knownIds, expectedId: id, missingRefs: 'warning' });
  report.name = id ?? path.basename(root);
  const { errors } = printIssues([report], (line) => console.log(`  ${line}`));
  if (errors || !id || !manifest) fail('package rejected; fix the errors above and import again');

  const dest = path.join(contentDir, id);
  if (fs.existsSync(dest) && !replace) fail(`content/${id} already exists (publication IDs are unique; use --replace to update it)`);
  fs.mkdirSync(contentDir, { recursive: true });
  const incoming = path.join(contentDir, `.incoming-${id}`);
  fs.rmSync(incoming, { recursive: true, force: true });
  fs.cpSync(pkgDir, incoming, { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.renameSync(incoming, dest);

  console.log(`✓ Added content/${id}/ (${report.files.length} files)`);
  console.log(`  Page: /${manifest.kind}/${id}/`);
  console.log('  Next: npm run publication:validate, then commit the folder.');
}
