import type { PdfPage } from './types.ts';

/** The slice of a pdf.js document this needs. Typed structurally so the same
 * code serves the browser build and the Node build used by the check script. */
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

interface RawItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

const isTextItem = (i: unknown): i is RawItem =>
  typeof i === 'object' && i !== null && 'str' in i && 'transform' in i;

/** Reads every page's text runs with their positions. Layout (columns, bands,
 * item boundaries) is decided later in parse.ts from these coordinates. */
export async function extractPages(doc: PdfDocLike): Promise<PdfPage[]> {
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({
      width: vp.width,
      height: vp.height,
      items: tc.items.filter(isTextItem).map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        w: i.width,
        h: i.height,
      })),
    });
  }
  return pages;
}
