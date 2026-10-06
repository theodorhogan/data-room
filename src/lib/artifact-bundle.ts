// Bundles a standalone JSX artifact into a self-contained document for a sandboxed iframe.
// Artifact code may import only the runtime below plus files inside its own package.
import path from 'node:path';
import * as esbuild from 'esbuild';
import { escapeHtml } from './format.ts';

export const ARTIFACT_RUNTIME = ['react', 'react-dom', 'recharts'];

const WRAPPER = `
import App from 'artifact-entry';
import { Component, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
class Boundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return h('pre', { style: { padding: 24, whiteSpace: 'pre-wrap', font: '14px/1.5 system-ui, sans-serif', color: '#B4233C' } },
      'This artifact failed to render.\\n\\n' + String(this.state.error && this.state.error.message || this.state.error));
  }
}
// Function and class components, plus memo/forwardRef/lazy wrappers (objects tagged with $$typeof).
const isComponent = typeof App === 'function' || (App !== null && typeof App === 'object' && typeof App.$$typeof === 'symbol');
const root = createRoot(document.getElementById('root'));
root.render(isComponent ? h(Boundary, null, h(App)) : h('pre', null, 'The artifact has no default-exported React component.'));
`;

export class ArtifactBuildError extends Error {}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export async function bundleArtifact(entryFile: string): Promise<string> {
  const pkgDir = path.resolve(path.dirname(entryFile));
  const root = process.cwd();
  const runtimeDir = path.join(root, 'node_modules') + path.sep;
  const guard: esbuild.Plugin = {
    name: 'artifact-boundary',
    setup(build) {
      build.onResolve({ filter: /^artifact-entry$/ }, () => ({ path: entryFile }));
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point' || args.importer === '<stdin>') return undefined;
        // Code of the installed runtime packages resolves normally; everything else is package code.
        const importer = path.resolve(args.importer);
        if (importer.startsWith(runtimeDir) && !importer.startsWith(pkgDir + path.sep)) return undefined;
        const attributes = Object.entries(args.with ?? {});
        if (attributes.some(([key, value]) => key !== 'type' || value !== 'json')) {
          return { errors: [{ text: `import attributes other than { type: 'json' } are not allowed ("${args.path}")` }] };
        }
        if (args.path.startsWith('.')) {
          const target = path.resolve(args.resolveDir, args.path);
          const rel = path.relative(pkgDir, target);
          if (rel.startsWith('..') || path.isAbsolute(rel)) return { errors: [{ text: `"${args.path}" is outside the publication package` }] };
          return undefined;
        }
        if (!ARTIFACT_RUNTIME.includes(packageName(args.path)) || args.path.split('/').some((seg) => seg === '.' || seg === '..')) {
          return { errors: [{ text: `"${args.path}" is not available to artifacts (allowed: ${ARTIFACT_RUNTIME.join(', ')})` }] };
        }
        return undefined;
      });
    },
  };
  try {
    const result = await esbuild.build({
      stdin: { contents: WRAPPER, resolveDir: root, loader: 'jsx', sourcefile: 'artifact-host.jsx' },
      bundle: true,
      write: false,
      outfile: path.join(root, 'artifact.bundle.js'),
      minify: true,
      format: 'iife',
      target: 'es2020',
      jsx: 'automatic',
      // Package images become data URLs (the frame CSP allows data: images); CSV and text load as strings.
      loader: {
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.json': 'json',
        '.csv': 'text',
        '.txt': 'text',
        '.svg': 'dataurl',
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.gif': 'dataurl',
        '.webp': 'dataurl',
        '.avif': 'dataurl',
      },
      define: { 'process.env.NODE_ENV': '"production"' },
      nodePaths: [path.join(root, 'node_modules')],
      legalComments: 'none',
      logLevel: 'silent',
      plugins: [guard],
    });
    const js = result.outputFiles.find((f) => f.path.endsWith('.js'));
    if (result.outputFiles.some((f) => f.path.endsWith('.css'))) throw new ArtifactBuildError('CSS imports are not supported; use inline styles');
    return js!.text;
  } catch (e) {
    if (e instanceof ArtifactBuildError) throw e;
    const errors = (e as esbuild.BuildFailure).errors ?? [];
    const detail = errors.length
      ? errors
          .map((m) =>
            m.text.includes('for import "default"')
              ? `${path.basename(entryFile)} has no default export; export default a React component`
              : `${m.location ? `${path.basename(m.location.file)}:${m.location.line}: ` : ''}${m.text}`,
          )
          .join('\n')
      : (e as Error).message;
    throw new ArtifactBuildError(detail);
  }
}

/** The document loaded inside the artifact iframe. A strict CSP keeps the artifact offline and isolated. */
export function artifactDocument(title: string, script: string): string {
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  const safeScript = script.replace(/<\/(script)/gi, '<\\/$1');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;min-height:100%}</style>
</head>
<body>
<div id="root"></div>
<script>
if (window.top === window) { location.replace('./'); } else {
${safeScript}
}
</script>
</body>
</html>
`;
}
