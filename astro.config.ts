import path from 'node:path';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import type { Plugin } from 'vite';
import { remarkResearch } from './src/lib/research-mdx.ts';
import { deployment } from './src/site.config.ts';

const contentDir = path.resolve('content');
const { site, base } = deployment();

/** In dev, edits to any package file (CSV, references, manifest…) recompile that package and reload. */
function contentWatcher(): Plugin {
  return {
    name: 'publication-content-watcher',
    configureServer(server) {
      server.watcher.add(contentDir);
      const onChange = (file: string) => {
        const rel = path.relative(contentDir, file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return;
        const pkgDir = path.join(contentDir, rel.split(path.sep)[0]) + path.sep;
        for (const env of Object.values(server.environments)) {
          for (const mod of env.moduleGraph.idToModuleMap.values()) {
            if (mod.file && path.resolve(mod.file).startsWith(pkgDir)) env.moduleGraph.invalidateModule(mod);
          }
        }
        server.ws.send({ type: 'full-reload' });
      };
      // Astro keeps the page list of a route (its getStaticPaths result) until the route's own file changes. A package or
      // file that appears or disappears changes that list, so the publication routes are marked changed (once per burst).
      const routes = ['index.astro', '[...file].ts', 'frame.html.ts'].map((f) => path.resolve('src/pages/[kind]/[id]', f));
      let pending: ReturnType<typeof setTimeout> | undefined;
      const onAddOrRemove = (file: string) => {
        onChange(file);
        const rel = path.relative(contentDir, file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return;
        clearTimeout(pending);
        pending = setTimeout(() => routes.forEach((r) => server.watcher.emit('change', r)), 300);
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onAddOrRemove);
      server.watcher.on('unlink', onAddOrRemove);
      server.watcher.on('addDir', onAddOrRemove);
      server.watcher.on('unlinkDir', onAddOrRemove);
    },
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  markdown: {
    processor: unified({ remarkPlugins: [[remarkResearch, { contentDir }]] }),
  },
  integrations: [mdx()],
  vite: { plugins: [contentWatcher()] },
});
