// Validate every publication package in content/ (or only the given package folders).
// Usage: npm run publication:validate [-- content/<id> ...]
import path from 'node:path';
import { contentDirectory } from '../src/lib/packages.ts';
import { printIssues, validateContent } from '../src/lib/validate.ts';

const contentDir = contentDirectory();
const only = process.argv.slice(2).map((p) => path.resolve(p));
const { reports, stray } = await validateContent(contentDir, only);

if (!reports.length) {
  console.error(only.length ? 'No matching packages in content/.' : 'No publication packages found in content/.');
  process.exit(1);
}
const { errors, warnings } = printIssues(reports);
for (const name of stray) console.log(`warning content/${name}: only package folders belong in content/`);
console.log(`\n${reports.length} package(s), ${errors} error(s), ${warnings + stray.length} warning(s)`);
process.exit(errors ? 1 : 0);
