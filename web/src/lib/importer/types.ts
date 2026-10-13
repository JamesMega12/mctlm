import type { Group, Option, ServiceLevel, Unit } from '../../types';

// Importer modules import each other with explicit `.ts` extensions so the
// pure parts (parse, match) can run straight under Node for the real-PDF
// check in web/scripts/check-pdfs.ts. Nothing here touches the DOM or React.

/** One run of text from pdf.js, in PDF user space (origin bottom-left, y up). */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfPage {
  width: number;
  height: number;
  items: TextItem[];
}

/** One check as written in an InTouch document. */
export interface ParsedItem {
  /** Section number as printed in the document (1, 2, ...). */
  sectionNo: number;
  sectionName: string;
  /** WO band label as printed ("WO #2: Mechanical"); null for SL0. */
  band: string | null;
  text: string;
  /** SL0 answer options; empty for SL1/3/4. */
  options: Option[];
  page: number;
}

export interface ParsedDoc {
  fileName: string;
  /** App unit name ("376/377", "573"), or null if the title wasn't recognised. */
  unit: Unit | null;
  /** App service level ("Outgoing", "SL3"), or null if not recognised. */
  level: ServiceLevel | null;
  group: Group | null;
  /** Footer revision, e.g. "V4.1, 14-Aug-26". */
  version: string | null;
  items: ParsedItem[];
  /** Anything the parser wasn't sure about. Shown in the import preview. */
  warnings: string[];
}
