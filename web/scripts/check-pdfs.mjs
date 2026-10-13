// Parses every InTouch ACP PDF under a folder with the same code the app uses
// and prints one line per document, so a new batch can be sanity-checked before
// it is imported. Exits non-zero if any document has warnings.
//
//   npm run check:pdfs -- "C:\path\to\folder"
//
// Needs Node 24 (it imports the TypeScript sources directly).
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPages } from '../src/lib/importer/extract.ts';
import { parseDocument } from '../src/lib/importer/parse.ts';

const root = process.argv[2];
if (!root) {
  console.error('Usage: npm run check:pdfs -- <folder with InTouch PDFs>');
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.pdf$/i.test(e.name) ? [p] : [];
  });

let flagged = 0;
const totals = {};
for (const file of walk(root).sort()) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
  const parsed = parseDocument(await extractPages(doc, pdfjs.OPS), path.basename(file));
  const key = parsed.group ?? '?';
  totals[key] = (totals[key] ?? 0) + parsed.items.length;
  const unit = parsed.unit ? `CPF-${parsed.unit}` : '?';
  console.log(
    `${path.basename(file).padEnd(52)} ${unit.padEnd(12)} ${String(parsed.level ?? '?').padEnd(9)} ${String(parsed.version ?? '').padEnd(20)} ${String(parsed.items.length).padStart(4)} checks  ${parsed.warnings.length ? `${parsed.warnings.length} WARNING(S)` : 'ok'}`,
  );
  for (const w of parsed.warnings.slice(0, 5)) console.log(`    - ${w}`);
  if (parsed.warnings.length) flagged++;
}
console.log('\nChecks per group:', totals);
if (flagged) {
  console.log(`${flagged} document(s) need a look before importing.`);
  process.exit(1);
}
