// Compiled research MDX modules (compiled by Astro's MDX integration + remarkResearch).
import type { Citation } from './research-mdx.ts';
import type { Publication } from './registry.ts';

export interface ResearchModule {
  Content: (props: { components?: Record<string, unknown> }) => unknown;
  getHeadings(): { depth: number; slug: string; text: string }[];
  citations: Citation[];
  publicationRefs: string[];
  exhibitCount: number;
}

const modules = import.meta.glob<ResearchModule>('/content/**/*.mdx');

export async function loadResearch(pub: Publication): Promise<ResearchModule> {
  const key = `/content/${pub.id}/${pub.manifest.primary}`;
  const load = modules[key];
  if (!load) throw new Error(`Research MDX not found: ${key}`);
  return load();
}
