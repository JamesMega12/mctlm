import type { PdfPage } from './types.ts';

/** The pdf.js operator codes this needs (`pdfjs.OPS`). Passed in so this file
 * stays free of a pdf.js import and serves both the browser and Node builds. */
export interface PdfOps {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
}

/** The slice of a pdf.js document this needs. Typed structurally so the same
 * code serves the browser build and the Node build used by the check script. */
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
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

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Y of every thin, wide horizontal line drawn on the page, highest first.
 * Tables like the 2-year SLX document draw a line between rows, which is the
 * exact boundary between two checks. Returns [] if the drawing commands aren't
 * in the shape this expects (pdf.js 6), so callers fall back to text alone. */
async function readRules(
  page: Awaited<ReturnType<PdfDocLike['getPage']>>,
  ops: PdfOps,
): Promise<number[]> {
  try {
    const list = await page.getOperatorList();
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const ys: number[] = [];
    list.fnArray.forEach((fn, i) => {
      const args = list.argsArray[i];
      if (fn === ops.save) stack.push(ctm);
      else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
      else if (fn === ops.transform) ctm = mul(ctm, args as Matrix);
      else if (fn === ops.constructPath) {
        // [paint op, [path data], bounds]. Path data runs 0 x y (move), 1 x y (line),
        // 2 x1 y1 x2 y2 x y (curve), 3 x1 y1 x y (quadratic), 4 (close).
        const d = (args as [number, ArrayLike<number>[], unknown])[1][0];
        let pts: [number, number][] = [];
        const flush = () => {
          if (pts.length) {
            const xs = pts.map((p) => p[0]);
            const ps = pts.map((p) => p[1]);
            const w = Math.max(...xs) - Math.min(...xs);
            const h = Math.max(...ps) - Math.min(...ps);
            if (h <= 1.6 && w >= 250) ys.push((Math.max(...ps) + Math.min(...ps)) / 2);
          }
          pts = [];
        };
        const at = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
        for (let k = 0; k < d.length; ) {
          const c = d[k++];
          if (c === 0) {
            flush();
            pts.push(at(d[k], d[k + 1]));
            k += 2;
          } else if (c === 1) {
            pts.push(at(d[k], d[k + 1]));
            k += 2;
          } else if (c === 2) {
            pts.push(at(d[k + 4], d[k + 5]));
            k += 6;
          } else if (c === 3) {
            pts.push(at(d[k + 2], d[k + 3]));
            k += 4;
          }
        }
        flush();
      }
    });
    return ys.sort((a, b) => b - a);
  } catch {
    return [];
  }
}

/** Reads every page's text runs with their positions, and the lines drawn
 * between table rows. Layout (columns, bands, item boundaries) is decided later
 * in parse.ts from these coordinates. */
export async function extractPages(doc: PdfDocLike, ops?: PdfOps): Promise<PdfPage[]> {
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
      rules: ops ? await readRules(page, ops) : [],
    });
  }
  return pages;
}
