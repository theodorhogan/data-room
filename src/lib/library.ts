// Library page data: one entry per publication plus the facet values in use.
import { sortTags, tagLabel, TAG_SLUGS } from './manifest';
import { getPublications, url } from './registry';

export interface LibraryItem {
  id: string;
  href: string;
  title: string;
  summary?: string;
  date: string;
  year: string;
  kind: 'research' | 'artifact';
  format: 'mdx' | 'pdf' | 'xlsx' | 'jsx';
  typeLabel: string;
  readingMinutes?: number;
  tags: { slug: string; label: string }[];
  tickers: string[];
}

export function libraryItems(): LibraryItem[] {
  return getPublications().map((p) => ({
    id: p.id,
    href: url(p.path),
    title: p.manifest.title,
    summary: p.manifest.summary,
    date: p.manifest.date,
    year: p.year,
    kind: p.manifest.kind,
    format: p.manifest.format,
    typeLabel: p.typeLabel,
    readingMinutes: p.readingMinutes ?? undefined,
    tags: sortTags(p.manifest.tags).map((t) => ({ slug: t, label: tagLabel(t) })),
    tickers: p.manifest.tickers,
  }));
}

/** Tags and tickers in use, with counts (tags in the fixed-list order). */
export function libraryFacets(items: LibraryItem[]) {
  const tagCount = new Map<string, number>();
  const tickerCount = new Map<string, number>();
  for (const i of items) {
    for (const t of i.tags) tagCount.set(t.slug, (tagCount.get(t.slug) ?? 0) + 1);
    for (const t of i.tickers) tickerCount.set(t, (tickerCount.get(t) ?? 0) + 1);
  }
  return {
    tags: TAG_SLUGS.filter((t) => tagCount.has(t)).map((t) => ({ slug: t, label: tagLabel(t), count: tagCount.get(t)! })),
    tickers: [...tickerCount].sort((a, b) => a[0].localeCompare(b[0])).map(([t, count]) => ({ ticker: t, count })),
    years: [...new Set(items.map((i) => i.year))].sort().reverse(),
  };
}
