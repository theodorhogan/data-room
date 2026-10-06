// After `astro build`: print every research MDX page to an A4 PDF with headless Chromium and
// save it next to the page as dist/research/<id>/<id>.pdf. Only the publication itself is printed.
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { contentDirectory, listPackageDirs, readPackage } from '../src/lib/packages.ts';
import { deployment, SITE } from '../src/site.config.ts';

const dist = path.resolve('dist');
const { base, site } = deployment();
/** A4 width minus the 17 mm side margins, in CSS pixels. */
const CONTENT_WIDTH_PX = Math.floor(((210 - 34) / 25.4) * 96);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** Minimal static server for dist/ under the configured base path. */
function serve(): Promise<{ origin: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = path.join(dist, pathname.startsWith(base) ? pathname.slice(base.length) : '\0');
    if (!file.startsWith(dist)) file = '\0';
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    }),
  );
}

/** Playwright's Chromium (CI) or, locally, an installed Chrome/Edge. */
async function launch(): Promise<Browser> {
  const channel = process.env.PDF_BROWSER_CHANNEL;
  if (channel) return chromium.launch({ channel });
  try {
    return await chromium.launch();
  } catch (error) {
    for (const fallback of ['chrome', 'msedge']) {
      try {
        const browser = await chromium.launch({ channel: fallback });
        console.log(`  (Playwright Chromium not installed; using local ${fallback})`);
        return browser;
      } catch {
        /* try the next channel */
      }
    }
    throw new Error(`No Chromium available. Run "npx playwright install chromium".\n${(error as Error).message}`);
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const footer = (title: string) =>
  `<div style="width:100%;margin:0 17mm;font:7.5px Arial,sans-serif;color:#5A6573;display:flex;justify-content:space-between;">` +
  `<span>${escape(SITE.title)} · ${escape(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

const research = listPackageDirs(contentDirectory())
  .map(readPackage)
  // A report that brings its own PDF (manifest `pdf`) is not printed.
  .filter((p) => p.manifest?.format === 'mdx' && !p.manifest.pdf)
  .map((p) => p.manifest!);

if (!fs.existsSync(dist)) throw new Error('dist/ not found; run astro build first');
if (!research.length) console.log('No research MDX publications to print.');
else {
  const server = await serve();
  const browser = await launch();
  try {
    const page = await browser.newPage({ colorScheme: 'light' });
    for (const m of research) {
      await page.emulateMedia({ media: 'screen' });
      await page.setViewportSize({ width: 1280, height: 900 });
      const pageUrl = `${server.origin}${base}${m.kind}/${m.id}/`;
      const response = await page.goto(pageUrl, { waitUntil: 'networkidle' });
      if (!response?.ok()) throw new Error(`${pageUrl} returned ${response?.status()}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('[data-mermaid]')].every((el) => el.dataset.rendered), null, {
        timeout: 60_000,
      });
      const broken = await page.locator('[data-mermaid][data-rendered="error"]').count();
      if (broken) throw new Error(`${m.id}: ${broken} diagram(s) failed to render; see the page in npm run preview`);

      // Links must point at the published site, not at this temporary server; without SITE_URL they are removed.
      await page.evaluate((siteUrl) => {
        for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          if (a.getAttribute('href')!.startsWith('#')) continue;
          const target = new URL(a.href);
          if (target.origin !== location.origin) continue;
          if (siteUrl) a.href = new URL(target.pathname + target.search + target.hash, siteUrl).href;
          else a.removeAttribute('href');
        }
      }, site ?? null);

      // Anything wider than the A4 text column would make Chromium shrink every page.
      await page.emulateMedia({ media: 'print' });
      await page.setViewportSize({ width: CONTENT_WIDTH_PX, height: 1000 });
      const overflow = await page.evaluate((limit) => {
        if (document.documentElement.scrollWidth <= limit + 1) return null;
        const candidates = [...document.querySelectorAll<HTMLElement>('main figure, main table, main pre, main img, main svg, main *')];
        const wide = candidates.find((el) => el.getBoundingClientRect().right > limit + 1);
        return wide ? `${wide.tagName.toLowerCase()}${wide.id ? `#${wide.id}` : ''}.${wide.className}` : 'unknown element';
      }, CONTENT_WIDTH_PX);
      if (overflow) console.warn(`  ! ${m.id}: content wider than the A4 text column (${overflow}); the PDF will be scaled down`);

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footer(m.title),
        margin: { top: '18mm', right: '17mm', bottom: '20mm', left: '17mm' },
        outline: true,
        tagged: true,
      });
      const out = path.join(dist, m.kind, m.id, `${m.id}.pdf`);
      fs.writeFileSync(out, pdf);
      console.log(`✓ ${path.relative(process.cwd(), out)} (${Math.round(pdf.length / 1024)} KB)`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}
