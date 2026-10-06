// Serves every file of a publication package under its canonical URL,
// e.g. /artifact/<id>/model.xlsx or /research/<id>/chart-01.csv.
import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { getPublications } from '../../../lib/registry';

const TYPES: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.mmd': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function getStaticPaths() {
  return getPublications().flatMap((pub) =>
    pub.files.map((file) => ({
      params: { kind: pub.manifest.kind, id: pub.id, file },
      props: { abs: path.join(pub.dir, ...file.split('/')) },
    })),
  );
}

export const GET: APIRoute = ({ props }) => {
  const abs = props.abs as string;
  return new Response(fs.readFileSync(abs), {
    headers: { 'Content-Type': TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' },
  });
};
