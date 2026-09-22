import { jsPDF } from 'jspdf';
import autoTable, { type CellInput, type RowInput } from 'jspdf-autotable';
import { GOF, SLNAME, SLS, TODAY, UNITS } from './constants';
import { status } from './derive';
import type { Check, Group, Section, ServiceLevel, SyncStatus, Unit } from '../types';

export interface ExportFilters {
  mg: Group;
  q: string;
  fsec: number | '';
  fst: SyncStatus | '';
}

export interface ExportPdfArgs {
  checks: Check[];
  sections: Section[];
  expU: Unit[];
  expL: ServiceLevel[];
  expGrp: 'unit' | 'level';
  expAns: boolean;
  filters: ExportFilters;
}

export interface PdfError {
  code?: string;
}

/** Strips characters jsPDF's built-in fonts can't render, so exported wording
 * (em dashes, arrows) never comes out as boxes. */
const pdfSafe = (s: string): string =>
  String(s)
    .replace(/[→]/g, '->')
    .replace(/[—–]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');

interface ClaudeDownloads {
  save: (args: { filename: string; data: Blob }) => Promise<void>;
}

let downloadsPromise: Promise<ClaudeDownloads | null> | null = null;

/** Prefers the claude.ai `downloads` capability when the app runs as a
 * published artifact; resolves to null everywhere else (including this local
 * dev server), where callers fall back to jsPDF's own doc.save(). */
function getDownloadsCapability(): Promise<ClaudeDownloads | null> {
  if (!downloadsPromise) {
    const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<ClaudeDownloads> } }).claude;
    downloadsPromise = claude?.use ? claude.use('downloads').catch(() => null) : Promise.resolve(null);
  }
  return downloadsPromise;
}

/** Same predicate as lib/derive.ts's baseMatch, minus the group check — the
 * caller here has already filtered the list down to one group per document. */
function baseMatchNoGroup(c: Check, g: Group, filters: ExportFilters): boolean {
  const ql = filters.q.toLowerCase();
  return (
    (!ql || c.n.toLowerCase().includes(ql)) &&
    (g !== filters.mg || filters.fsec === '' || c.s === filters.fsec) &&
    (!filters.fst || status(c) === filters.fst)
  );
}

/** Builds one page per unit x service-level document and saves the PDF.
 * Returns the number of document pages produced. */
export async function exportPdf(args: ExportPdfArgs): Promise<{ pairs: number }> {
  const { checks, sections, expU, expL, expGrp, expAns, filters } = args;

  const dl = await getDownloadsCapability();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const us = UNITS.filter((u) => expU.includes(u));
  const ls = SLS.filter((s) => expL.includes(s));

  const pairs: [Unit, ServiceLevel][] = [];
  if (expGrp === 'unit') us.forEach((u) => ls.forEach((s) => pairs.push([u, s])));
  else ls.forEach((s) => us.forEach((u) => pairs.push([u, s])));

  let first = true;
  pairs.forEach(([u, s]) => {
    const g = GOF(s);
    const list = checks.filter(
      (c) => c.g === g && baseMatchNoGroup(c, g, filters) && c.rows.some((r) => r.u === u && r.s === s),
    );

    if (!first) doc.addPage();
    first = false;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`CPF-${u} · ${SLNAME(s)} checklist`, 36, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      pdfSafe(
        `${list.length} checks${filters.fsec !== '' ? ' · section: ' + sections[filters.fsec].name : ''}${filters.q ? ' · search: "' + filters.q + '"' : ''}${filters.fst ? ' · status: ' + filters.fst : ''} · generated ${TODAY}`,
      ),
      36,
      56,
    );
    doc.setTextColor(0);

    const headRow = expAns ? ['#', 'Check', 'Answers', 'SWI'] : ['#', 'Check', 'SWI'];
    const colCount = headRow.length;
    const body: RowInput[] = [];
    let last = -1;
    let i = 0;

    list.forEach((c) => {
      if (c.s !== last) {
        last = c.s;
        const sc = sections[c.s];
        body.push([
          {
            content: pdfSafe(sc.name + (g !== 'SL0' && sc.wo ? '  (' + sc.wo + ')' : '')),
            colSpan: colCount,
            styles: { fillColor: [220, 232, 245], fontStyle: 'bold' },
          },
        ]);
      }
      const row: CellInput[] = [++i, pdfSafe(c.n)];
      if (expAns) {
        const ansText = c.o.length
          ? pdfSafe(c.o.map((o, k) => `${k + 1}. ${o.t}  [${o.bad ? 'defect' : 'good'}]`).join('\n'))
          : 'No answer options in source';
        row.push(c.o.length ? ansText : { content: ansText, styles: { textColor: [150, 150, 150], fontStyle: 'italic' } });
      }
      row.push(c.swi ? 'Yes' : '');
      body.push(row);
    });

    if (!list.length) {
      body.push([{ content: `No checks in CPF-${u} ${SLNAME(s)} match the current filters.`, colSpan: colCount }]);
    }

    autoTable(doc, {
      head: [headRow],
      body,
      startY: 68,
      margin: { left: 36, right: 36, top: 40, bottom: 36 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, valign: 'top', lineColor: [211, 218, 224], lineWidth: 0.4 },
      headStyles: { fillColor: [22, 37, 46], textColor: 255 },
      columnStyles: expAns
        ? { 0: { cellWidth: 24 }, 1: { cellWidth: 300 }, 3: { cellWidth: 30 } }
        : { 0: { cellWidth: 24 }, 2: { cellWidth: 36 } },
      rowPageBreak: 'avoid',
    });
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${pages}`, doc.internal.pageSize.getWidth() - 36, doc.internal.pageSize.getHeight() - 18, {
      align: 'right',
    });
  }

  const filename =
    (us.length === 1 ? `CPF-${us[0]}` : `CPF ${us.length} units`) +
    ' ' +
    (ls.length <= 3 ? ls.map(SLNAME).join(' ') : `${ls.length} levels`) +
    ' checklist.pdf';

  if (dl) await dl.save({ filename, data: doc.output('blob') });
  else doc.save(filename);

  return { pairs: pairs.length };
}
