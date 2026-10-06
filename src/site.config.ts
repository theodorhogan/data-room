// Site identity and deployment settings. Branding lives in src/styles/tokens.css.
export const SITE = {
  title: 'Data Room',
  description: 'Equity research, macro notes and financial models.',
  /** Keep every page out of search engines (noindex, nofollow on every page). */
  noindex: true,
};

/**
 * Deployment target, from the environment so one build works for GitHub Pages
 * project URLs (BASE_PATH=/repo-name) and later for a custom domain (BASE_PATH=/).
 */
export function deployment(env: Record<string, string | undefined> = process.env) {
  const site = env.SITE_URL?.trim() || undefined;
  const raw = (env.BASE_PATH ?? '/').trim();
  const base = `/${raw.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '') + '/';
  return { site, base };
}
