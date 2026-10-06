// The sandboxed document that hosts a JSX artifact (loaded by ArtifactFrame's iframe).
import path from 'node:path';
import type { APIRoute } from 'astro';
import { artifactDocument, bundleArtifact } from '../../../lib/artifact-bundle';
import { getPublications, type Publication } from '../../../lib/registry';

export function getStaticPaths() {
  return getPublications()
    .filter((pub) => pub.manifest.format === 'jsx')
    .map((pub) => ({ params: { kind: pub.manifest.kind, id: pub.id }, props: { pub } }));
}

export const GET: APIRoute = async ({ props }) => {
  const pub = props.pub as Publication;
  const script = await bundleArtifact(path.join(pub.dir, ...pub.manifest.primary.split('/')));
  return new Response(artifactDocument(pub.manifest.title, script), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
