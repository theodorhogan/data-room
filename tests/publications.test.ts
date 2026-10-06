// Contract tests: validation rules, the importer, CSV parsing and the chart engine.
// Run with `npm test`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { bundleArtifact } from '../src/lib/artifact-bundle.ts';
import { prepareAnnotations, prepareChart, renderChartSvg, type ChartOptions } from '../src/lib/chart.ts';
import { parseCsv } from '../src/lib/csv.ts';
import { parseManifest } from '../src/lib/packages.ts';
import { keyFigures, tableHooks } from '../src/lib/tables.ts';
import { readWorkbook } from '../src/lib/workbook.ts';
import ExcelJS from 'exceljs';
import { validateContent, validatePackage } from '../src/lib/validate.ts';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-tests-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const manifest = (id: string, extra = '', kind = 'research', format = 'mdx', primary = 'index.mdx') =>
  `schema: 1\nid: ${id}\ntitle: Test ${id}\ndate: ${id.slice(0, 10)}\nkind: ${kind}\nformat: ${format}\nprimary: ${primary}\n${extra}`;

/** Write a package folder under a fresh content dir and return its path. */
function pkg(id: string, files: Record<string, string | Uint8Array>): string {
  const dir = path.join(tmp, `content-${id}-${Math.random().toString(36).slice(2)}`, id);
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

async function errors(dir: string, knownIds: string[] = []): Promise<string[]> {
  const report = await validatePackage(dir, { contentDir: path.dirname(dir), knownIds: new Set([path.basename(dir), ...knownIds]) });
  return report.issues.filter((i) => i.level === 'error').map((i) => i.message);
}

const ID = '2026-01-02-test-report';
const REFS = 'src-a:\n  title: Source A\n  publisher: Pub\n  url: https://example.com/a\n';
const CSV = 'quarter,value\nQ1,1\nQ2,2\n';

describe('manifest', () => {
  test('accepts the v1 fields', () => {
    const r = parseManifest(manifest(ID, 'summary: S\ntags:\n  - dcf\nrelated:\n  - 2026-01-01-other\n'));
    assert.deepEqual(r.issues, []);
    assert.equal(r.manifest?.format, 'mdx');
  });
  test('tags come from the fixed list (slug or label); tickers are normalised stock symbols', () => {
    const ok = parseManifest(manifest(ID, 'tags:\n  - Deep Research\n  - equity-research\n  - DCF\ntickers:\n  - prlb\n  - RNO.PA\n'));
    assert.deepEqual(ok.issues, []);
    assert.deepEqual(ok.manifest?.tags, ['deep-research', 'equity-research', 'dcf']);
    assert.deepEqual(ok.manifest?.tickers, ['PRLB', 'RNO.PA']);
    const bad = parseManifest(manifest(ID, 'tags:\n  - valuation\ntickers:\n  - Proto Labs\n')).issues.map((i) => i.message).join('\n');
    assert.match(bad, /tags must come from the list: Deep Research, Macro/);
    assert.match(bad, /tickers are stock symbols/);
  });
  test('rejects malformed IDs, unknown kinds and unknown keys', () => {
    const r = parseManifest(manifest('2026-1-2-Bad_ID', 'colour: red\n', 'report'));
    const text = r.issues.map((i) => i.message).join('\n');
    assert.match(text, /id must look like/);
    assert.match(text, /kind must be one of/);
    assert.match(text, /Unrecognized key/);
  });
  test('rejects impossible dates and duplicate keys', () => {
    assert.match(parseManifest(manifest(ID).replace(/date: .*/, 'date: 2026-02-30')).issues[0].message, /calendar date/);
    assert.match(parseManifest(manifest('2026-13-45-bad-date')).issues.map((i) => i.message).join(), /real calendar date/);
    assert.match(parseManifest(manifest(ID) + 'title: again\n').issues[0].message, /invalid YAML/);
  });
});

describe('research package validation', () => {
  const base = { 'manifest.yaml': manifest(ID), 'references.yaml': REFS, 'q.csv': CSV };

  test('a well-formed report passes', async () => {
    const dir = pkg(ID, { ...base, 'index.mdx': '# T\n\n## One\n\nText.<Cite id="src-a" />\n\n<Chart src="./q.csv" type="bar" title="Up" sources="src-a" />\n' });
    assert.deepEqual(await errors(dir), []);
  });
  test('unknown citation IDs fail', async () => {
    const dir = pkg(ID, { ...base, 'index.mdx': 'Text <Cite id="missing" /> and <Cite id="src-a" />.\n' });
    assert.match((await errors(dir)).join('\n'), /citation "missing" is not defined/);
  });
  test('only the approved vocabulary is allowed', async () => {
    const dir = pkg(ID, {
      ...base,
      'index.mdx': 'import X from "x"\n\n<div style="color:#f00">hi</div>\n\n<Chart src="./q.csv" type="bar" title={"t"} />\n\n{1 + 1}\n\n<Cite id="src-a" />\n',
    });
    const text = (await errors(dir)).join('\n');
    assert.match(text, /import\/export statements are not allowed/);
    assert.match(text, /<div> is not part of the research MDX vocabulary/);
    assert.match(text, /must be a quoted string/);
    assert.match(text, /JavaScript expressions/);
  });
  test('asset paths may not leave the package and must exist', async () => {
    const dir = pkg(ID, { ...base, 'index.mdx': '<Chart src="../other/q.csv" type="bar" title="t" />\n\n<Table src="./nope.csv" title="t" />\n\n[x](./missing.csv)\n\n<Cite id="src-a" />\n' });
    const text = (await errors(dir)).join('\n');
    assert.match(text, /must be a relative path inside the publication package/);
    assert.match(text, /does not exist in the package/);
    assert.match(text, /link "\.\/missing\.csv" does not exist/);
  });
  test('chart columns are checked against the data', async () => {
    const dir = pkg(ID, { ...base, 'index.mdx': '<Chart src="./q.csv" type="line" x="date" y="value" title="t" />\n\n<Cite id="src-a" />\n' });
    assert.match((await errors(dir)).join('\n'), /column "date" not found/);
  });
  test('cross-publication references must resolve', async () => {
    const mdx = 'See <PublicationRef id="2026-01-01-the-model" />.<Cite id="src-a" />\n';
    const withRelated = { ...base, 'manifest.yaml': manifest(ID, 'related:\n  - 2026-01-01-the-model\n'), 'index.mdx': mdx };
    const text = (await errors(pkg(ID, withRelated))).join('\n');
    assert.match(text, /no publication with this ID/);
    assert.match(text, /related publication "2026-01-01-the-model" does not exist/);
    assert.deepEqual(await errors(pkg(ID, withRelated), ['2026-01-01-the-model']), []);
  });
  test('folder name, primary extension and reserved names are enforced', async () => {
    const wrongFolder = pkg('2026-01-02-other-name', { ...base, 'index.mdx': 'x <Cite id="src-a" />\n' });
    assert.match((await errors(wrongFolder)).join('\n'), /must equal the package folder name/);
    const wrongExt = pkg(ID, { 'manifest.yaml': manifest(ID, '', 'artifact', 'pdf', 'paper.xlsx'), 'paper.xlsx': 'x' });
    assert.match((await errors(wrongExt)).join('\n'), /must be a \.pdf file/);
    const reserved = pkg(ID, { ...base, 'index.mdx': 'x <Cite id="src-a" />\n', [`${ID}.pdf`]: '%PDF-1.7' });
    assert.match((await errors(reserved)).join('\n'), /reserved for the generated A4 PDF/);
  });
  test('a research report may name its own PDF to download instead of the generated one', async () => {
    const own = (pdf: string, files: Record<string, string>, format = 'mdx', primary = 'index.mdx') =>
      pkg(ID, { ...base, 'index.mdx': 'x <Cite id="src-a" />\n', ...files, 'manifest.yaml': manifest(ID, `pdf: ${pdf}\n`, 'research', format, primary) });
    assert.deepEqual(await errors(own('original.pdf', { 'original.pdf': '%PDF-1.7' })), []);
    assert.match((await errors(own('original.pdf', {}))).join('\n'), /pdf file "original.pdf" does not exist/);
    assert.match((await errors(own('original.pdf', { 'original.pdf': 'not a pdf' }))).join('\n'), /pdf is not a PDF file/);
    assert.match((await errors(own('report.txt', { 'report.txt': '%PDF-1.7' }))).join('\n'), /must be a \.pdf file/);
    // Nothing is generated for such a report, so it may use the name otherwise reserved for the generated PDF.
    assert.deepEqual(await errors(own(`${ID}.pdf`, { [`${ID}.pdf`]: '%PDF-1.7' })), []);
    assert.match((await errors(own('paper.pdf', { 'paper.pdf': '%PDF-1.7' }, 'pdf', 'paper.pdf'))).join('\n'), /only to research reports/);
  });
  test('only safe file types may be published', async () => {
    const dir = pkg(ID, {
      ...base,
      'index.mdx': 'x <Cite id="src-a" />\n',
      'readme.html': '<script>alert(1)</script>',
      'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      'payload.js': 'export default 1',
      'notes.mdx': '## Notes',
      'node_modules/x/index.json': '{}',
    });
    const text = (await errors(dir)).join('\n');
    assert.match(text, /\.html files are not allowed/);
    assert.match(text, /SVG files must not contain scripts/);
    assert.match(text, /script files belong only in JSX artifact packages/);
    assert.match(text, /only the primary file may be MDX/);
    assert.match(text, /node_modules folders are not allowed/);
  });
  test('SVG checks see through namespaces, entities and embedded XHTML', async () => {
    const svgs = {
      'a.svg': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
      'b.svg': '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript&#58;alert(1)"><text>x</text></a></svg>',
      'c.svg': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml"><h:iframe src="x"/></svg>',
      'd.svg': '<!DOCTYPE svg [<!ENTITY x "javascript:alert(1)">]><svg xmlns="http://www.w3.org/2000/svg"><a href="&x;"/></svg>',
    };
    const bad = pkg(ID, { ...base, 'index.mdx': 'x <Cite id="src-a" />\n', ...svgs });
    const text = (await errors(bad)).join('\n');
    for (const name of Object.keys(svgs)) assert.match(text, new RegExp(`"${name}": SVG files must not contain`));
    const ok = pkg(ID, { ...base, 'index.mdx': 'x <Cite id="src-a" />\n', 'ok.svg': '<svg xmlns="http://www.w3.org/2000/svg"><desc>A description of a subscript</desc><rect width="1" height="1"/></svg>' });
    assert.deepEqual(await errors(ok), []);
  });
  test('site paths and restyling Mermaid directives anywhere are rejected', async () => {
    const dir = pkg(ID, {
      ...base,
      'd.mmd': 'flowchart LR\n  A --> B %%{init: {"look": "handDrawn"}}%%\n',
      'index.mdx': '[other](/research/x/) <Mermaid src="./d.mmd" title="t" />\n\n<Cite id="src-a" />\n',
    });
    const text = (await errors(dir)).join('\n');
    assert.match(text, /is a site path/);
    assert.match(text, /configuration directives/);
  });
  test('links and reference URLs must be http(s)', async () => {
    const dir = pkg(ID, {
      ...base,
      'references.yaml': REFS + 'src-b:\n  title: B\n  url: javascript:alert(1)\n',
      'index.mdx': '[click](javascript:alert(1)) and [mail](mailto:a@b.c) <Cite id="src-a" />\n',
    });
    const text = (await errors(dir)).join('\n');
    assert.match(text, /url must be an absolute http\(s\) URL/);
    assert.match(text, /unsupported scheme/);
    assert.doesNotMatch(text, /link "mailto/);
  });
  test('frontmatter and Markdown images are rejected', async () => {
    const fm = pkg(ID, { ...base, 'index.mdx': '---\nlayout: ./x.js\n---\n\nText <Cite id="src-a" />\n' });
    assert.match((await errors(fm)).join('\n'), /frontmatter is not allowed/);
    const img = pkg(ID, { ...base, 'fig.png': 'x', 'index.mdx': '![fig](./fig.png) <Cite id="src-a" />\n' });
    assert.match((await errors(img)).join('\n'), /Markdown images are not supported/);
  });
  test('asset names are case-sensitive on every platform', async () => {
    const dir = pkg(ID, { ...base, 'index.mdx': '<Table src="./Q.csv" title="t" />\n\n<Cite id="src-a" />\n' });
    assert.match((await errors(dir)).join('\n'), /case-sensitive: the file is "q\.csv"/);
  });
  test('source_ids in data files are checked citations', async () => {
    const dir = pkg(ID, { ...base, 't.csv': 'a,source_ids\n1,src-a typo-ref\n', 'index.mdx': '<Table src="./t.csv" title="t" />\n' });
    assert.match((await errors(dir)).join('\n'), /citation "typo-ref" is not defined/);
  });
  test('diagrams may not restyle themselves', async () => {
    const dir = pkg(ID, {
      ...base,
      'd.mmd': "%%{init: {'theme':'dark'}}%%\nflowchart LR\n  A --> B\n  style A fill:#f00\n",
      'index.mdx': '<Mermaid src="./d.mmd" title="t" />\n\n<Cite id="src-a" />\n',
    });
    assert.match((await errors(dir)).join('\n'), /configuration directives/);
  });
});

describe('artifact package validation', () => {
  const ART = '2026-01-03-test-artifact';
  test('PDF primaries must be PDFs', async () => {
    const dir = pkg(ART, { 'manifest.yaml': manifest(ART, '', 'artifact', 'pdf', 'paper.pdf'), 'paper.pdf': 'not a pdf' });
    assert.match((await errors(dir)).join('\n'), /not a PDF/);
  });
  test('JSX artifacts build and may only import the artifact runtime', async () => {
    const ok = pkg(ART, {
      'manifest.yaml': manifest(ART, '', 'artifact', 'jsx', 'artifact.jsx'),
      'artifact.jsx': 'import { useState } from "react";\nimport { LineChart } from "recharts";\nexport default function App() { const [n] = useState(1); return <p>{n}{String(!!LineChart)}</p>; }\n',
    });
    assert.deepEqual(await errors(ok), []);
    const bad = pkg(ART, {
      'manifest.yaml': manifest(ART, '', 'artifact', 'jsx', 'artifact.jsx'),
      'artifact.jsx': 'import _ from "lodash";\nimport secret from "../../package.json";\nexport default () => <p>{_ && secret}</p>;\n',
    });
    const text = (await errors(bad)).join('\n');
    assert.match(text, /"lodash" is not available to artifacts/);
    assert.match(text, /outside the publication package/);
  });
  test('artifact code cannot reach files through runtime packages or package-local node_modules', async () => {
    const escape = pkg(ART, { 'artifact.jsx': 'import p from "recharts/../../package.json";\nexport default () => <p>{String(p)}</p>;\n' });
    await assert.rejects(bundleArtifact(path.join(escape, 'artifact.jsx')), /not available to artifacts/);
    const local = pkg(ART, {
      'artifact.jsx': 'import x from "./vendor/node_modules/h/index.js";\nexport default () => <p>{x}</p>;\n',
      'vendor/node_modules/h/index.js': 'import z from "zod";\nexport default String(z);\n',
    });
    await assert.rejects(bundleArtifact(path.join(local, 'artifact.jsx')), /"zod" is not available to artifacts/);
  });
  test('memo components are accepted and a missing default export is an error', async () => {
    const memo = pkg(ART, { 'artifact.jsx': 'import { memo } from "react";\nexport default memo(() => <p>hi</p>);\n' });
    assert.ok((await bundleArtifact(path.join(memo, 'artifact.jsx'))).includes('$$typeof'));
    const none = pkg(ART, { 'artifact.jsx': 'export const App = () => <p/>;\n' });
    await assert.rejects(bundleArtifact(path.join(none, 'artifact.jsx')), /has no default export/);
  });
});

describe('repository content', () => {
  test('every package in content/ is valid', async () => {
    const { reports } = await validateContent(path.join(root, 'content'));
    assert.ok(reports.length >= 1);
    const problems = reports.flatMap((r) => r.issues.filter((i) => i.level === 'error').map((i) => `${r.name}: ${i.message}`));
    assert.deepEqual(problems, []);
  });
});

describe('importer', () => {
  const run = (cwd: string, ...args: string[]) => {
    try {
      return { ok: true, out: execFileSync(process.execPath, [path.join(root, 'scripts/publication-add.ts'), ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      const err = e as { stdout: string; stderr: string };
      return { ok: false, out: `${err.stdout}${err.stderr}` };
    }
  };
  const zip = (entries: Record<string, string>) => {
    const file = path.join(tmp, `pkg-${Math.random().toString(36).slice(2)}.zip`);
    fs.writeFileSync(file, zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)]))));
    return file;
  };

  test('imports a zipped package, normalises format and rejects duplicates', () => {
    const cwd = fs.mkdtempSync(path.join(tmp, 'site-'));
    const file = zip({
      [`${ID}/manifest.yaml`]: manifest(ID).replace('format: mdx\n', ''),
      [`${ID}/index.mdx`]: '## A\n\nText <Cite id="src-a" />\n',
      [`${ID}/references.yaml`]: REFS,
      [`${ID}/.DS_Store`]: 'junk',
    });
    const first = run(cwd, file);
    assert.ok(first.ok, first.out);
    assert.match(first.out, /added "format: mdx"/);
    assert.deepEqual(fs.readdirSync(path.join(cwd, 'content', ID)).sort(), ['index.mdx', 'manifest.yaml', 'references.yaml']);
    const again = run(cwd, file);
    assert.ok(!again.ok);
    assert.match(again.out, /already exists/);
    assert.ok(run(cwd, file, '--replace').ok);
  });
  test('rejects path traversal, multiple packages and invalid packages', () => {
    const cwd = fs.mkdtempSync(path.join(tmp, 'site-'));
    assert.match(run(cwd, zip({ 'manifest.yaml': manifest(ID), '../evil.txt': 'x' })).out, /unsafe path/);
    assert.match(run(cwd, zip({ 'a/manifest.yaml': manifest(ID), 'b/manifest.yaml': manifest(ID) })).out, /exactly one publication package/);
    const invalid = run(cwd, zip({ 'manifest.yaml': manifest(ID), 'index.mdx': '<Cite id="nope" />\n' }));
    assert.ok(!invalid.ok);
    assert.match(invalid.out, /package rejected/);
    assert.ok(!fs.existsSync(path.join(cwd, 'content', ID)));
  });
});

describe('workbook viewer', () => {
  test('opens on the saved active sheet and marks pictures in cells', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Inputs').getCell('A1').value = 'input';
    const model = wb.addWorksheet('Model');
    model.getCell('A1').value = 'value';
    model.getCell('B2').value = 'logo';
    wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 1, visibility: 'visible' }];
    const plain = path.join(tmp, 'active.xlsx');
    await wb.xlsx.writeFile(plain);
    // Excel stores an in-cell picture as a cell with value metadata (vm) and a #VALUE! fallback.
    const parts = unzipSync(new Uint8Array(fs.readFileSync(plain)));
    const sheet = Object.keys(parts).find((n) => /worksheets\/sheet2\.xml$/.test(n))!;
    parts[sheet] = strToU8(strFromU8(parts[sheet]).replace(/<c r="B2"/, '<c r="B2" vm="1"'));
    const withPicture = path.join(tmp, 'picture.xlsx');
    fs.writeFileSync(withPicture, zipSync(parts));
    const read = await readWorkbook(withPicture);
    assert.equal(read.activeSheet, 'Model');
    const cell = read.sheets[1].rows[1].cells[1];
    assert.equal(cell?.picture, true);
    assert.equal(cell?.text, '');
  });
  test('shows collapsed groups expanded and applies theme colours, borders and conditional formats', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Model');
    const header = ws.getCell('A1');
    header.value = 'Revenue';
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 4, tint: 0.7999816888943144 } as Partial<ExcelJS.Color> }; // ExcelJS typings omit tint
    header.font = { color: { theme: 0 }, size: 14 };
    header.border = { bottom: { style: 'medium', color: { argb: 'FF001C5B' } } };
    ws.getCell('A2').value = 'body';
    ws.getCell('A2').font = { size: 11 };
    ws.getCell('A3').value = 'body';
    ws.getCell('A3').font = { size: 11 };
    for (const r of [4, 5, 6]) {
      ws.getRow(r).outlineLevel = 1;
      ws.getRow(r).hidden = true; // a collapsed group
      ws.getCell(`B${r}`).value = r - 5; // -1, 0, 1
    }
    ws.getColumn(3).hidden = true; // deliberately hidden, not grouped
    ws.getCell('C1').value = 'secret';
    ws.addConditionalFormatting({ ref: 'B4:B6', rules: [{ type: 'colorScale', priority: 2, cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FF000000' }, { argb: 'FFFFFFFF' }] } as never] });
    ws.addConditionalFormatting({
      ref: 'B4:B6',
      rules: [{ type: 'cellIs', priority: 1, operator: 'lessThan', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } } } as never],
    });
    const file = path.join(tmp, 'formatting.xlsx');
    await wb.xlsx.writeFile(file);

    const sheet = (await readWorkbook(file)).sheets[0];
    assert.deepEqual(sheet.rows.map((r) => r.index), [1, 2, 3, 4, 5, 6], 'grouped rows are shown');
    assert.deepEqual(sheet.columns.map((c) => c.letter), ['A', 'B'], 'hidden column stays hidden');
    const cell = (address: string) => sheet.rows.flatMap((r) => r.cells).find((c) => c?.address === address)!;
    const a1 = cell('A1').style!;
    assert.match(a1, /background:#[0-9A-F]{6}/);
    assert.doesNotMatch(a1, /background:#FFFFFF/);
    assert.match(a1, /color:#FFFFFF/, 'theme 0 (lt1) resolves to white');
    assert.match(a1, /border-bottom:2px solid #001C5B/);
    assert.match(a1, /font-size:16.5px/, '14pt against an 11pt base');
    assert.ok(cell('A1').filled);
    assert.match(cell('B4').style!, /background:#FFC7CE;color:#9C0006|color:#9C0006.*background:#FFC7CE|background:#FFC7CE.*color:#9C0006/, 'cellIs < 0 wins over the colour scale');
    assert.match(cell('B6').style!, /background:#FFFFFF/, 'maximum of the colour scale');
    assert.match(cell('B5').style!, /background:#808080/, 'midpoint of the colour scale');
  });
});

describe('csv and charts', () => {
  test('parses quoted fields with commas, quotes and newlines', () => {
    const t = parseCsv('a,b\n"x, y","say ""hi""\nthere"\n1,\n');
    assert.deepEqual(t.rows, [{ a: 'x, y', b: 'say "hi"\nthere' }, { a: '1', b: '' }]);
  });
  test('keeps quotes inside unquoted fields and rejects bad headers', () => {
    assert.deepEqual(parseCsv('name,height\nBob,5\'10"\nAl,6\'1"\n').rows, [{ name: 'Bob', height: '5\'10"' }, { name: 'Al', height: '6\'1"' }]);
    assert.throws(() => parseCsv('a,a\n1,2\n'), /appears more than once/);
    assert.throws(() => parseCsv('a,\n1,2\n'), /has no header/);
  });
  test('prepares grouped series and renders one bar per value', () => {
    const table = parseCsv('q,m,v\nQ1,Capex,8.5\nQ1,FCF,-0.4\nQ2,Capex,12.0\nQ2,FCF,-10.0\n');
    const data = prepareChart(table, { type: 'bar', x: 'q', y: 'v', series: 'm' });
    assert.equal(data.series.length, 2);
    assert.equal(data.decimals, 1);
    const svg = renderChartSvg(data, { type: 'bar' }, { width: 680, height: 330 }, 'Title');
    assert.equal(svg.match(/<rect class="bar s[12]"/g)?.length, 4 + 2); // four bars plus two legend swatches
    assert.ok(svg.includes('\u221210.0'), 'negative values use the true minus sign');
  });
  test('rejects impossible dates on a time axis', () => {
    assert.throws(() => prepareChart(parseCsv('d,v\n2026-01-31,5\n2026-13-01,7\n'), { type: 'line' }), /"2026-13-01" is not a real date/);
  });
  test('signed single-series bars carry the sign; short time spans get day ticks', () => {
    const bars = renderChartSvg(prepareChart(parseCsv('k,v\nA,4.1\nB,-2.0\n'), { type: 'bar' }), { type: 'bar' }, { width: 680, height: 330 }, 't');
    assert.ok(bars.includes('+4.1') && bars.includes('\u22122.0'));
    const days = renderChartSvg(prepareChart(parseCsv('d,v\n2026-09-20,1\n2026-09-25,2\n'), { type: 'line' }), { type: 'line' }, { width: 680, height: 330 }, 't');
    assert.ok(days.includes('>20 Sep<'), 'day tick labels for a five-day span');
  });
  test('rejects empty series and unknown highlights; orders category series along the axis', () => {
    assert.throws(() => prepareChart(parseCsv('d,s,v\n2026-01-01,A,1\n2026-01-01,B,\n'), { type: 'line', series: 's', y: 'v' }), /series "B" has no numeric values/);
    assert.throws(() => prepareChart(parseCsv('q,v\nQ1,1\nQ2,2\n'), { type: 'bar', highlight: 'Q5' }), /highlight "Q5" matches nothing/);
    const data = prepareChart(parseCsv('k,s,v\nA,x,1\nB,x,2\nC,x,3\nC,y,1\nA,y,2\nB,y,3\n'), { type: 'line', series: 's', y: 'v' });
    assert.deepEqual(data.series[1].points.map((p) => p.key), ['A', 'B', 'C']);
    const points = renderChartSvg(prepareChart(parseCsv('k,s,v\nA,Oil,1\nA,Gas,2\n'), { type: 'point', series: 's', y: 'v' }), { type: 'point' }, { width: 680, height: 330 }, 't');
    assert.ok(points.includes('>Oil<') && points.includes('>Gas<'), 'multi-series point charts have a legend');
  });
  test('rejects unknown columns and more than four series', () => {
    assert.throws(() => prepareChart(parseCsv('a,b\n1,2\n'), { type: 'bar', y: 'c' }), /column "c" not found/);
    const wide = parseCsv('x,s,v\n' + ['a', 'b', 'c', 'd', 'e'].map((s) => `1,${s},1`).join('\n'));
    assert.throws(() => prepareChart(wide, { type: 'line', x: 'x', y: 'v', series: 's' }), /at most 4/);
  });
});

describe('extended exhibit vocabulary', () => {
  const draw = (csv: string, opts: ChartOptions, notes = '') => {
    const data = prepareChart(parseCsv(csv), opts);
    const ann = notes ? prepareAnnotations(parseCsv(notes), data, opts) : [];
    return renderChartSvg(data, opts, { width: 680, height: 330 }, 't', ann);
  };
  test('stacked bars stack, need non-negative values and show one total per category', () => {
    const svg = draw('q,s,v\nFY24,A,3\nFY24,B,2\nFY25,A,4\nFY25,B,1\n', { type: 'bar', series: 's', y: 'v', stacked: true });
    assert.equal(svg.match(/<rect class="bar s[12]" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+"><title>/g)?.length, 4);
    assert.ok(svg.includes('>5<'), 'stack totals are labelled');
    assert.throws(() => prepareChart(parseCsv('q,s,v\nA,x,1\nA,y,-1\n'), { type: 'bar', series: 's', y: 'v', stacked: true }), /zero or more/);
    assert.throws(() => prepareChart(parseCsv('q,v\nA,1\n'), { type: 'line', stacked: true }), /vertical bar/);
  });
  test('log scales need positive values; measure overrides the sign inference', () => {
    assert.throws(() => prepareChart(parseCsv('d,v\n2020-01,1\n2021-01,0\n'), { type: 'line', scale: 'log' }), /above zero/);
    const log = draw('d,v\n2012-01,1.5\n2021-01,280\n', { type: 'line', scale: 'log' });
    assert.ok(log.includes('>100<') && log.includes('>10<'), 'decade ticks');
    const level = draw('k,v\nA,4.1\nB,-2.0\n', { type: 'bar', measure: 'level' });
    assert.ok(!level.includes('+4.1') && !level.includes('class="bar neg"'), 'levels are not signal-coloured');
    const change = draw('k,v\nA,4.1\nB,2.0\n', { type: 'bar', measure: 'change' });
    assert.ok(change.includes('+4.1') && change.includes('class="bar pos"'));
  });
  test('range and scatter charts', () => {
    const range = draw('year,low,high,actual\nFY24,500,520,515\nFY25,495,510,\n', { type: 'range', low: 'low', high: 'high', y: 'actual', highlight: 'FY25' });
    assert.equal(range.match(/class="range/g)?.length, 2);
    assert.equal(range.match(/<circle class="dot/g)?.length, 1, 'point markers only where present');
    assert.throws(() => prepareChart(parseCsv('k,a\nA,1\n'), { type: 'range', low: 'a' }), /low and high/);
    const scatter = draw('name,growth,margin,cap\nPRLB,2.1,11,1.8\nXometry,20,-5,2.5\n', { type: 'scatter', x: 'growth', y: 'margin', label: 'name', size: 'cap', highlight: 'PRLB' });
    assert.ok(scatter.includes('>PRLB<') && scatter.includes('pt-lbl hl'));
    assert.throws(() => prepareChart(parseCsv('n,x,y\nA,1,two\n'), { type: 'scatter', x: 'x', y: 'y', label: 'n' }), /not a number/);
  });
  test('annotations: bands, one highlight/forecast/note, reference lines', () => {
    const csv = 'year,v\nFY22,1\nFY23,2\nFY24,3\nFY25,4\n';
    const svg = draw(csv, { type: 'bar' }, 'kind,from,to,value,label\nband,FY22,FY23,,Era one\nforecast,FY25,,,\nnote,FY24,,,Peak year\nline,,,2.5,Average\n');
    assert.ok(svg.includes('class="band"') && svg.includes('class="fcband"') && svg.includes('>FORECAST<'));
    assert.ok(svg.includes('class="note-ring"') && svg.includes('>Peak year<') && svg.includes('class="ref"'));
    const data = prepareChart(parseCsv(csv), { type: 'bar' });
    assert.throws(() => prepareAnnotations(parseCsv('kind,from\nnote,FY22\n'), data, { type: 'bar' }), /needs from and a label/);
    assert.throws(() => prepareAnnotations(parseCsv('kind,from,label\nnote,FY22,a\nnote,FY23,b\n'), data, { type: 'bar' }), /at most one note/);
    assert.throws(() => prepareAnnotations(parseCsv('kind,from,to\nband,FY22,FY30\n'), data, { type: 'bar' }), /not a category/);
    assert.throws(() => prepareAnnotations(parseCsv('kind,from,to\nband,FY22,FY23\n'), data, { type: 'bar', orientation: 'horizontal' }), /horizontal axis/);
    assert.throws(() => prepareAnnotations(parseCsv('kind,value\nline,abc\n'), data, { type: 'bar' }), /not a number/);
    const dated = draw('d,v\n2020-01-01,1\n2022-01-01,3\n', { type: 'line' }, 'kind,from,to,label\nhighlight,2020-06-01,2021-06-01,Covid\n');
    assert.ok(dated.includes('class="hlband"') && dated.includes('>COVID<'));
  });
  test('vertical markers, staggered band labels and a 100% stack without an empty step', () => {
    const hist = draw('bin,n\n30,5\n40,9\n50,4\n70,1\n80,0\n', { type: 'bar' }, 'kind,from,label\nline,70,Target $71\nline,80,Price $78\n');
    assert.equal(hist.match(/<line class="ref"/g)?.length, 2);
    assert.ok(hist.includes('>Target $71<') && hist.includes('>Price $78<'));
    const acts = draw(
      'd,v\n2012-01-01,10\n2018-01-01,100\n2020-01-01,50\n2021-01-01,200\n2026-01-01,70\n',
      { type: 'line' },
      'kind,from,to,label\nband,2012-01-01,2018-06-01,Act I · Growth darling\nband,2018-06-01,2020-06-01,Act II · Derating\nband,2020-06-01,2021-02-01,Act III · Mania\n',
    );
    const rowsUsed = new Set([...acts.matchAll(/<text class="band-lbl" x="[\d.]+" y="([\d.]+)"/g)].map((m) => m[1]));
    assert.equal([...acts.matchAll(/class="band-lbl"/g)].length, 3, 'every band keeps its label');
    assert.ok(rowsUsed.size > 1, 'labels that would collide move to another row');
    assert.ok(!acts.includes('…'), 'no label is shortened when a row has room');
    const shares = draw('y,s,v\nFY24,A,60.1\nFY24,B,40.0\n', { type: 'bar', series: 's', y: 'v', stacked: true });
    assert.ok(!shares.includes('>120<'), 'a 100.1% stack stays on a 0–100 axis');
  });
  test('annotation edge cases are caught before rendering', () => {
    const logOpts: ChartOptions = { type: 'line', scale: 'log' };
    const logData = prepareChart(parseCsv('d,v\n2020-01,5\n2021-01,50\n'), logOpts);
    assert.throws(() => prepareAnnotations(parseCsv('kind,value,label\nline,0,Break-even\n'), logData, logOpts), /above zero/);
    const flat = draw('d,v\n2020-01,10\n2021-01,10\n', logOpts);
    assert.ok(!flat.includes('NaN'), 'a log chart of equal tick values still has a range');
    assert.throws(() => prepareAnnotations(parseCsv('kind,from,label\nline,2009-06,IPO\n'), logData, logOpts), /outside the chart's dates/);
    assert.throws(() => prepareChart(parseCsv('k,v\nA,5\nB,3\n'), { type: 'line', highlight: 'A' }), /matches nothing/);
    const gapOpts: ChartOptions = { type: 'line', series: 's', y: 'v' };
    const gap = prepareChart(parseCsv('k,s,v\nA,X,1\nB,X,\nC,X,3\n'), gapOpts);
    assert.throws(() => prepareAnnotations(parseCsv('kind,from,label,series\nnote,B,Gap,X\n'), gap, gapOpts), /has no value/);
    assert.ok(draw('k,v\nA,1\nB,4\nC,3\n', { type: 'bar' }, 'kind,value\nline,2.5\n').includes('>2.5<'), 'an unlabelled line prints its own value');
  });
  test('the note ring stays clear of bar value labels', () => {
    const svg = draw('k,v\nA,2\nB,5\n', { type: 'bar' }, 'kind,from,value,label\nnote,B,5,Peak\n');
    const ring = Number(svg.match(/class="note-ring" cx="[\d.]+" cy="([\d.]+)"/)![1]);
    const label = Number(svg.match(/<text class="dl pos" x="[\d.]+" y="([\d.]+)"[^>]*><tspan[^>]*>5</)?.[1] ?? svg.match(/<text class="dl s1" x="[\d.]+" y="([\d.]+)"[^>]*><tspan[^>]*>5</)![1]);
    assert.ok(ring < label - 12, 'ring sits above the value label');
  });
  test('a highlighted series keeps its colour in the legend; value labels sit above reference lines', () => {
    const svg = draw('k,s,v\nA,X,2\nA,Y,3\nB,X,4\nB,Y,5\n', { type: 'bar', series: 's', y: 'v', highlight: 'Y' }, 'kind,value,label\nline,4.5,Median\n');
    assert.match(svg, /<rect class="bar hl"[^>]*\/><text class="lg"[^>]*><tspan[^>]*>Y</);
    assert.ok(svg.indexOf('class="ref"') < svg.indexOf('class="dl'), 'reference line drawn before the value labels');
    assert.ok(!svg.includes('<!--dl-->'));
  });
  test('named categories that would lose their labels turn sideways; periods are thinned', () => {
    const narrow = (csv: string) => {
      const opts: ChartOptions = { type: 'bar' };
      return renderChartSvg(prepareChart(parseCsv(csv), opts), opts, { width: 360, height: 280 }, 't', []);
    };
    const names = ['Trendyol', 'Hepsiburada', 'Amazon Turkey', 'Ciceksepeti', 'Other marketplaces', 'Pazarama', 'N11'];
    const named = narrow(`k,v\n${names.map((n, i) => `${n},${i + 1}`).join('\n')}\n`);
    for (const n of names) assert.ok(named.includes(`>${n}<`), `${n} is labelled`);
    assert.match(named, /class="ax cat"/);
    const years = narrow(`k,v\n${Array.from({ length: 15 }, (_, i) => `FY${21 + i}A,${i + 1}`).join('\n')}\n`);
    assert.doesNotMatch(years, /class="ax cat"/);
  });
  test('table roles resolve names and reject unknown ones; key figures carry signs', () => {
    const t = parseCsv('metric,FY24A,FY25E\nRevenue,500,520\nGrowth,-1.2,4.0\nEPS,1.1,1.3\n');
    const hooks = tableHooks(t, { highlight: 'EPS', key: 'Revenue|EPS', changes: 'Growth', forecast: 'FY25E' });
    assert.deepEqual(hooks, { highlight: 'EPS', key: ['Revenue', 'EPS'], changeColumns: [], changeRows: ['Growth'], forecast: ['FY25E'] });
    assert.throws(() => tableHooks(t, { highlight: 'EPS|Revenue' }), /one row only/);
    assert.throws(() => tableHooks(t, { forecast: 'FY26E' }), /no column "FY26E"/);
    assert.throws(() => tableHooks(t, { changes: 'Margin' }), /neither a column nor a row/);
    const figs = keyFigures(parseCsv('label,value,note\nRating,HOLD,\nUpside,-8.9%,vs $77.93\nTarget,$71.00,\n'));
    assert.deepEqual(figs.map((f) => [f.value, f.sign]), [['HOLD', undefined], ['−8.9%', 'neg'], ['$71.00', undefined]]);
    assert.throws(() => keyFigures(parseCsv('name,value\nA,1\n')), /"label" column/);
    assert.equal(keyFigures(parseCsv('label,value\nFCF,$(3.1)m\nNet cash,$-2.0m\n')).map((f) => f.sign).join(), 'neg,neg');
  });
  test('research MDX accepts the new props and KeyFigures, and validates annotation files', async () => {
    const mdx =
      '## Section\n\n<KeyFigures src="./kf.csv" title="At a glance" />\n\n' +
      '<Chart src="./d.csv" type="bar" title="T" annotations="./notes.csv" measure="level" />\n\n' +
      '<Table src="./d.csv" title="T" highlight="Q2" key="Q1" forecast="value" />\n';
    const ok = pkg(ID, {
      'manifest.yaml': manifest(ID, 'authors:\n  - AMSA Equity Research\n'),
      'index.mdx': mdx,
      'd.csv': CSV,
      'kf.csv': 'label,value\nRating,HOLD\n',
      'notes.csv': 'kind,from,label\nnote,Q2,Latest\n',
    });
    assert.deepEqual(await errors(ok), []);
    const bad = pkg(ID, {
      'manifest.yaml': manifest(ID),
      'index.mdx': mdx.replace('./notes.csv', './missing.csv').replace('highlight="Q2"', 'highlight="Q9"'),
      'd.csv': CSV,
      'kf.csv': 'label,value\nRating,HOLD\n',
    });
    const text = (await errors(bad)).join('\n');
    assert.match(text, /annotations "\.\/missing\.csv" does not exist/);
    assert.match(text, /no row starts with "Q9"/);
  });
});
