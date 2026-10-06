// remark plugin for research MDX inside content/<id>/.
// Enforces the small publication vocabulary, numbers citations and exhibits by first
// appearance, checks package-local assets and cross-publication IDs, and exports the
// ordered citation list. The site build and `publication:validate` run the same plugin.
import fs from 'node:fs';
import path from 'node:path';
import { createProcessor } from '@mdx-js/mdx';
import { parse as parseJs } from 'acorn';
import remarkGfm from 'remark-gfm';
import { chartOptions, prepareAnnotations, prepareChart, CHART_TYPES } from './chart.ts';
import { loadTable, SOURCE_ID_COLUMN } from './csv.ts';
import { listFiles, listPackageDirs, MANIFEST_FILE, REFERENCES_FILE, resolveInPackage, toPosix } from './packages.ts';
import { loadReferences, type Reference } from './references.ts';
import { keyFigures, tableHooks } from './tables.ts';

// Minimal structural types for the mdast/MDX nodes this plugin touches.
interface Attr {
  type: string;
  name?: string;
  value?: unknown;
}
interface Node {
  type: string;
  name?: string | null;
  depth?: number;
  value?: string;
  url?: string;
  attributes?: Attr[];
  children?: Node[];
  data?: { estree?: { body?: unknown[] } };
  position?: unknown;
}
interface VFileMessageLike {
  fatal?: boolean | null;
  reason: string;
  line?: number | null;
  column?: number | null;
}
interface VFileLike {
  path?: string;
  data?: { astro?: { frontmatter?: Record<string, unknown> } };
  messages: VFileMessageLike[];
  message(reason: string, place?: unknown): VFileMessageLike;
}

interface ComponentSpec {
  props: string[];
  required: string[];
  children?: boolean;
  src?: string[];
  enums?: Record<string, readonly string[]>;
}

/** The complete research MDX vocabulary (besides ordinary Markdown). */
export const COMPONENTS: Record<string, ComponentSpec> = {
  Cite: { props: ['id'], required: ['id'] },
  PublicationRef: { props: ['id', 'label'], required: ['id'] },
  Callout: { props: ['type', 'title'], required: [], children: true, enums: { type: ['note', 'important', 'warning'] } },
  Chart: {
    props: [
      'src', 'type', 'x', 'y', 'series', 'title', 'yLabel', 'caption', 'sources', 'orientation', 'highlight',
      'stacked', 'scale', 'measure', 'low', 'high', 'label', 'size', 'annotations',
    ],
    required: ['src', 'type', 'title'],
    src: ['.csv', '.json'],
    enums: {
      type: CHART_TYPES,
      orientation: ['vertical', 'horizontal'],
      stacked: ['true', 'false'],
      scale: ['linear', 'log'],
      measure: ['change', 'level'],
    },
  },
  Table: {
    props: ['src', 'title', 'unit', 'caption', 'sources', 'highlight', 'key', 'changes', 'forecast'],
    required: ['src', 'title'],
    src: ['.csv', '.json'],
  },
  KeyFigures: { props: ['src', 'title'], required: ['src'], src: ['.csv', '.json'] },
  Figure: {
    props: ['src', 'alt', 'title', 'caption', 'sources'],
    required: ['src', 'alt'],
    src: ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'],
  },
  Mermaid: { props: ['src', 'title', 'caption', 'sources'], required: ['src'], src: ['.mmd'] },
};
const EXHIBITS = new Set(['Chart', 'Table', 'Figure', 'Mermaid']);
// Diagrams take the site's colors and fonts; these Mermaid features would override them.
const MERMAID_STYLING: [RegExp, string][] = [
  [/%%\s*\{/, 'configuration directives (%%{…}%%)'],
  [/^\s*---\s*$/m, 'config blocks'],
  [/^\s*(style|classDef|linkStyle)\s/m, 'style, classDef and linkStyle statements'],
  [/\bstyle\s*=/i, 'inline style attributes'],
];
const LINK_SCHEMES = ['http', 'https', 'mailto'];
const PLAIN_HTML = new Set(['br', 'sup', 'sub']);

export interface Citation extends Reference {
  n: number;
}

export interface ResearchMdxOptions {
  contentDir: string;
  /** Validate a package that lives outside contentDir (used by the importer). */
  packageDir?: string;
  packageId?: string;
  /** Publication IDs that <PublicationRef> may point to. Defaults to the folders in contentDir. */
  knownIds?: Set<string>;
  /** The importer downgrades unknown <PublicationRef> IDs to warnings. */
  missingPublicationRefs?: 'error' | 'warning';
}

const isJsx = (n: Node | undefined) => !!n && (n.type === 'mdxJsxTextElement' || n.type === 'mdxJsxFlowElement');
const isCite = (n: Node | undefined) => isJsx(n) && n!.name === 'Cite';
const isComment = (n: Node) => Array.isArray(n.data?.estree?.body) && n.data!.estree!.body!.length === 0;
const attrValue = (n: Node, name: string) => n.attributes?.find((a) => a.type === 'mdxJsxAttribute' && a.name === name)?.value;
const setAttrs = (n: Node, attrs: Record<string, string>) => {
  n.attributes = Object.entries(attrs).map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value }));
};

/** Adjacent <Cite/> markers (only whitespace between) become one marker group; a space before a marker is dropped. */
function normalizeCites(node: Node) {
  if (!Array.isArray(node.children)) return;
  const out: Node[] = [];
  for (const child of node.children) {
    if (isCite(child)) {
      const prev = out[out.length - 1];
      const mergeTarget = isCite(prev) ? prev : prev?.type === 'text' && /^[ \t]*$/.test(prev.value ?? '') && isCite(out[out.length - 2]) ? out[out.length - 2] : undefined;
      const a = mergeTarget && attrValue(mergeTarget, 'id');
      const b = attrValue(child, 'id');
      if (mergeTarget && typeof a === 'string' && typeof b === 'string') {
        if (mergeTarget !== prev) out.pop();
        mergeTarget.attributes!.find((x) => x.name === 'id')!.value = `${a} ${b}`;
        continue;
      }
      if (prev?.type === 'text') prev.value = prev.value!.replace(/[ \t]+$/, '');
    }
    out.push(child);
  }
  node.children = out;
  out.forEach(normalizeCites);
}

function esm(code: string): Node {
  return { type: 'mdxjsEsm', value: code, data: { estree: parseJs(code, { ecmaVersion: 'latest', sourceType: 'module' }) as never } };
}

/** IDs referenced with <PublicationRef id="…"> in an MDX source, parsed exactly as the site parses it. */
export function publicationRefsIn(source: string): string[] {
  const ids = new Set<string>();
  const walk = (node: Node) => {
    if (isJsx(node) && node.name === 'PublicationRef') {
      const id = attrValue(node, 'id');
      if (typeof id === 'string') ids.add(id);
    }
    node.children?.forEach(walk);
  };
  try {
    walk(createProcessor({ remarkPlugins: [remarkGfm] }).parse(source) as unknown as Node);
  } catch {
    // Invalid MDX fails validation and the build elsewhere; there are no references to report.
  }
  return [...ids];
}

export function remarkResearch(options: ResearchMdxOptions) {
  const contentDir = path.resolve(options.contentDir);
  // unified passes an mdast Root and a VFile; this plugin only relies on the structural subset above.
  return (root: unknown, vfile: unknown) => {
    const tree = root as Node;
    const file = vfile as VFileLike;
    if (!file.path) return;
    const base = options.packageDir ? path.resolve(options.packageDir) : contentDir;
    const within = path.relative(base, path.resolve(file.path));
    if (!within || within.startsWith('..') || path.isAbsolute(within)) return;
    const pkgDir = options.packageDir ? base : path.join(contentDir, within.split(/[\\/]/)[0]);
    const rel = path.relative(path.dirname(pkgDir), path.resolve(file.path));
    const pkgName = options.packageId ?? path.basename(pkgDir);
    const knownIds =
      options.knownIds ??
      new Set(
        listPackageDirs(contentDir)
          .filter((d) => fs.existsSync(path.join(d, MANIFEST_FILE)))
          .map((d) => path.basename(d)),
      );
    const fail = (reason: string, place?: Node) => {
      file.message(reason, place?.position ? place : undefined).fatal = true;
    };
    const warn = (reason: string, place?: Node) => {
      file.message(reason, place?.position ? place : undefined);
    };

    const { refs, issues } = loadReferences(pkgDir);
    for (const issue of issues) (issue.level === 'error' ? fail : warn)(`${REFERENCES_FILE}: ${issue.message}`);
    // Astro reads frontmatter before this plugin runs (and could import a `layout`); metadata lives in manifest.yaml.
    if (Object.keys(file.data?.astro?.frontmatter ?? {}).length) fail('frontmatter is not allowed; metadata belongs in manifest.yaml');

    // Exact-case file list: existence checks must behave the same on Windows/macOS and in Linux CI.
    const files = new Set(listFiles(pkgDir).files);
    /** '' when the file exists with this exact case, otherwise a (possibly empty) hint. */
    const missingFile = (target: string): string | undefined => {
      const rel = toPosix(path.relative(pkgDir, target));
      if (files.has(rel)) return undefined;
      const other = [...files].find((f) => f.toLowerCase() === rel.toLowerCase());
      return other ? ` (file names are case-sensitive: the file is "${other}")` : '';
    };

    const children = tree.children ?? [];
    const first = children.findIndex((n) => !(n.type === 'mdxFlowExpression' && isComment(n)));
    if (first >= 0 && children[first].type === 'heading' && children[first].depth === 1) children.splice(first, 1);
    normalizeCites(tree);

    const cited = new Map<string, Citation>();
    const publicationRefs = new Set<string>();
    const dataTables: Node[] = [];
    let exhibits = 0;

    const cite = (id: string, node: Node): Citation | undefined => {
      const ref = refs.get(id);
      if (!ref) {
        fail(`citation "${id}" is not defined in ${REFERENCES_FILE}`, node);
        return undefined;
      }
      if (!cited.has(id)) cited.set(id, { ...ref, n: cited.size + 1 });
      return cited.get(id);
    };
    const citeRefs = (ids: string, node: Node) =>
      JSON.stringify(
        ids
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => cite(id, node))
          .filter((c): c is Citation => !!c)
          .map((c) => ({ id: c.id, n: c.n, label: c.publisher ? `${c.publisher}: ${c.title}` : c.title, publisher: c.publisher ?? c.title })),
      );

    const checkLocal = (url: string | undefined, node: Node, what: string) => {
      if (!url || url.startsWith('#')) return;
      const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
      if (scheme || url.startsWith('//')) {
        if (scheme && !LINK_SCHEMES.includes(scheme)) fail(`${what} "${url}" uses an unsupported scheme (allowed: ${LINK_SCHEMES.join(', ')})`, node);
        return;
      }
      if (url.startsWith('/')) {
        return fail(`${what} "${url}" is a site path, which breaks when the site moves; link publications with <PublicationRef id="…" />`, node);
      }
      let local: string;
      try {
        local = decodeURI(url.split(/[?#]/)[0]);
      } catch {
        return fail(`${what} "${url}" is not a valid URL`, node);
      }
      const target = resolveInPackage(pkgDir, local);
      const missing = target ? missingFile(target) : undefined;
      if (!target) fail(`${what} "${url}" points outside the publication package`, node);
      else if (missing !== undefined) fail(`${what} "${url}" does not exist in the package${missing}`, node);
    };

    /** A package file named by a component prop, checked for place, existence (exact case) and type. */
    const packageFile = (name: string, prop: string, value: string | undefined, types: string[], node: Node): string | undefined => {
      if (!value) return undefined;
      const target = resolveInPackage(pkgDir, value);
      const missing = target ? missingFile(target) : undefined;
      if (!target) fail(`<${name}>: ${prop} "${value}" must be a relative path inside the publication package`, node);
      else if (missing !== undefined) fail(`<${name}>: ${prop} "${value}" does not exist in the package${missing}`, node);
      else if (!types.includes(path.extname(target).toLowerCase())) fail(`<${name}>: ${prop} must be a ${types.join(' / ')} file`, node);
      else return target;
      return undefined;
    };

    const element = (node: Node) => {
      const name = node.name;
      if (!name) return fail('fragments (<>…</>) are not allowed', node);
      if (PLAIN_HTML.has(name)) {
        if (node.attributes?.length) fail(`<${name}> must not have attributes`, node);
        return;
      }
      const spec = COMPONENTS[name];
      if (!spec) {
        return fail(`<${name}> is not part of the research MDX vocabulary (allowed: ${Object.keys(COMPONENTS).join(', ')})`, node);
      }
      const props: Record<string, string> = {};
      for (const attr of node.attributes ?? []) {
        if (attr.type !== 'mdxJsxAttribute' || !attr.name) fail(`<${name}>: spread attributes are not allowed`, node);
        else if (!spec.props.includes(attr.name)) fail(`<${name}>: unknown prop "${attr.name}" (allowed: ${spec.props.join(', ')})`, node);
        else if (typeof attr.value !== 'string') fail(`<${name}>: prop "${attr.name}" must be a quoted string, not an expression or bare flag`, node);
        else props[attr.name] = attr.value;
      }
      for (const req of spec.required) if (!props[req]?.trim()) fail(`<${name}> requires a "${req}" prop`, node);
      for (const [key, allowed] of Object.entries(spec.enums ?? {})) {
        if (props[key] !== undefined && !allowed.includes(props[key])) fail(`<${name}>: ${key}="${props[key]}" must be one of ${allowed.join(', ')}`, node);
      }
      const hasChildren = (node.children ?? []).some((c) => c.type !== 'text' || c.value?.trim());
      if (!spec.children && hasChildren) fail(`<${name}> does not take children; use a self-closing tag`, node);

      if (name === 'Cite') {
        if (props.id) setAttrs(node, { refs: citeRefs(props.id, node) });
      } else if (name === 'PublicationRef') {
        if (!props.id) return;
        if (!knownIds.has(props.id)) {
          (options.missingPublicationRefs === 'warning' ? warn : fail)(`<PublicationRef id="${props.id}">: no publication with this ID exists in content/`, node);
        }
        else if (props.id === pkgName) warn('<PublicationRef> points to this publication itself', node);
        publicationRefs.add(props.id);
        setAttrs(node, { ...props, display: node.type === 'mdxJsxFlowElement' ? 'block' : 'inline' });
      } else if (name === 'KeyFigures') {
        const target = packageFile(name, 'src', props.src, spec.src!, node);
        const injected: Record<string, string> = { ...props, pkg: pkgName };
        if (target) {
          injected.src = toPosix(path.relative(pkgDir, target));
          try {
            keyFigures(loadTable(target));
          } catch (e) {
            fail(`<KeyFigures src="${props.src}">: ${(e as Error).message}`, node);
          }
        }
        setAttrs(node, injected);
      } else if (EXHIBITS.has(name)) {
        exhibits += 1;
        const injected: Record<string, string> = { ...props, exhibit: String(exhibits), pkg: pkgName, sourceRefs: citeRefs(props.sources ?? '', node) };
        delete injected.sources;
        // `key` is reserved by JSX, so the component receives it as keyRows.
        if (injected.key !== undefined) {
          injected.keyRows = injected.key;
          delete injected.key;
        }
        const target = packageFile(name, 'src', props.src, spec.src!, node);
        const notesFile = name === 'Chart' && props.annotations ? packageFile(name, 'annotations', props.annotations, ['.csv', '.json'], node) : undefined;
        if (notesFile) injected.annotations = toPosix(path.relative(pkgDir, notesFile));
        if (target) {
          injected.src = toPosix(path.relative(pkgDir, target));
          try {
            if (name === 'Chart' || name === 'Table') {
              const table = loadTable(target);
              if (name === 'Chart') {
                const opts = chartOptions(props);
                const data = prepareChart(table, opts);
                if (notesFile) prepareAnnotations(loadTable(notesFile), data, opts);
              }
              if (name === 'Table') tableHooks(table, props);
              // IDs in source_id(s) columns are citations too: checked and numbered at this exhibit.
              for (const col of table.columns.filter((c) => SOURCE_ID_COLUMN.test(c))) {
                table.rows.forEach((row, i) => {
                  for (const id of row[col].split(/\s+/).filter(Boolean)) {
                    if (refs.has(id)) cite(id, node);
                    else fail(`<${name} src="${props.src}">: row ${i + 2}, column "${col}": citation "${id}" is not defined in ${REFERENCES_FILE}`, node);
                  }
                });
              }
            }
            if (name === 'Mermaid') {
              const source = fs.readFileSync(target, 'utf8');
              if (!source.trim()) throw new Error('diagram file is empty');
              for (const [pattern, what] of MERMAID_STYLING) {
                if (pattern.test(source)) throw new Error(`${what} are not allowed; the site applies its own colors and fonts`);
              }
            }
          } catch (e) {
            fail(`<${name} src="${props.src}">: ${(e as Error).message}`, node);
          }
        }
        setAttrs(node, injected);
        if (name === 'Table' || name === 'Chart') dataTables.push(node);
      }
    };

    const visit = (node: Node) => {
      switch (node.type) {
        case 'mdxjsEsm':
          return fail('import/export statements are not allowed in research MDX', node);
        case 'mdxFlowExpression':
        case 'mdxTextExpression':
          if (!isComment(node)) fail('JavaScript expressions ({…}) are not allowed in research MDX', node);
          return;
        case 'heading':
          if (node.depth === 1) fail('a # heading is allowed only as the first line (the title comes from manifest.yaml); use ## for sections', node);
          break;
        case 'link':
        case 'definition':
          checkLocal(node.url, node, 'link');
          break;
        case 'image':
        case 'imageReference':
          return fail('Markdown images are not supported; use <Figure src="./…" alt="…" />', node);
        case 'yaml':
        case 'toml':
          return fail('frontmatter is not allowed; metadata belongs in manifest.yaml', node);
        case 'html':
          return fail('raw HTML is not allowed in research MDX', node);
        case 'mdxJsxFlowElement':
        case 'mdxJsxTextElement':
          element(node);
          break;
      }
      node.children?.forEach(visit);
    };
    visit(tree);

    // Data tables (including a chart's data view) render source_id(s) columns as citation links.
    const citeMap = JSON.stringify(Object.fromEntries([...cited.values()].map((c) => [c.id, c.n])));
    for (const t of dataTables) t.attributes!.push({ type: 'mdxJsxAttribute', name: 'citeMap', value: citeMap });

    for (const id of refs.keys()) if (!cited.has(id)) warn(`${REFERENCES_FILE}: "${id}" is never cited`);

    const citations = [...cited.values()].sort((a, b) => a.n - b.n);
    tree.children!.push(
      esm(
        `export const citations = ${JSON.stringify(citations)};\n` +
          `export const publicationRefs = ${JSON.stringify([...publicationRefs])};\n` +
          `export const exhibitCount = ${exhibits};`,
      ),
    );

    const fatal = file.messages.filter((m) => m.fatal);
    if (fatal.length) {
      const list = fatal.map((m) => `  - ${m.line ? `line ${m.line}: ` : ''}${m.reason}`).join('\n');
      throw new Error(`${fatal.length} problem(s) in content/${toPosix(rel)}:\n${list}`);
    }
  };
}
