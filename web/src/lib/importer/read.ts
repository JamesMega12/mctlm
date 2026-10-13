import { extractPages } from './extract.ts';
import { parseDocument } from './parse.ts';
import type { ParsedDoc } from './types.ts';

/** Reads one InTouch PDF in the browser. pdf.js (and its worker) load on first
 * use, so the rest of the app doesn't pay for them until someone imports. Never
 * throws: a file that can't be read comes back as a doc with a warning. */
export async function readPdf(file: File): Promise<ParsedDoc> {
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 });
    try {
      return parseDocument(await extractPages(await task.promise, pdfjs.OPS), file.name);
    } finally {
      void task.destroy();
    }
  } catch (err) {
    return {
      fileName: file.name,
      unit: null,
      level: null,
      group: null,
      version: null,
      items: [],
      warnings: [`Could not read this file as a PDF: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
