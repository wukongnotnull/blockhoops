// Builds dist/corner-court.html for publishing as a claude.ai Artifact.
// The host wraps the page in its own <!doctype>/<head>/<body> skeleton (charset and a
// viewport-fit=cover viewport included), so this strips ours and keeps the rest as-is.
// Module and stylesheet files are published alongside it under the same src/ paths.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = await readFile(`${root}index.html`, 'utf8');

const page = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/\s*<meta charset="utf-8">/i, '')
  .replace(/\s*<meta name="viewport"[^>]*>/i, '')
  .trim();

if (!page.startsWith('<title>')) throw new Error('Expected <title> to lead the artifact page');
await mkdir(`${root}dist`, { recursive: true });
await writeFile(`${root}dist/corner-court.html`, `${page}\n`);
process.stdout.write(`dist/corner-court.html (${page.length} bytes)\n`);
