import type { Option } from '../../types';
import type { ParsedDoc, ParsedItem, PdfPage, TextItem } from './types.ts';

// Parses an InTouch ACP document (one unit at one service level) from the text
// runs pdf.js reads out of it. The rules come from the hand-built master
// checklist; see HANDOVER.md "Importing InTouch documents".
//
//   SL1/3/4: single column. WO bands ("WO #1: ..." / "Task Line #1: ..."),
//     numbered sections, and one U+F099 glyph in the right margin on the first
//     line of every check. That glyph is the only reliable item delimiter.
//   SL0: two columns of numbered sections. Each check is a title plus bulleted
//     answer options: U+F099 marks the pass option, U+F0A3 the others.

const PASS = '';
const OTHER = '';
const PUA = /[-]/g;

/** Header block at the top of every page, and footer at the bottom. */
const HEADER_BAND = 85;
const FOOTER_BAND = 45;

const STOP = /Equipment status and signatures|Deficiency notes, corrective actions/;
/** The deficiency table's two-line heading sits just above the line STOP matches. */
const STOP_PAD = 16;
const SKIP = /^(Systems and Components|System Group$)/;
/** The right column's first heading can sit a few points above the "Checks" baseline. */
const CHECKS_SLACK = 10;
const BAND = /^(?:WO|Task Line)\s*#\s*(\d+)\s*:\s*(\S.*)$/i;
const SECTION = /^(\d{1,2})\s+(\S.*)$/;

interface Line {
  page: number;
  /** 0 = left or only column, 1 = right column. */
  col: number;
  y: number;
  x: number;
  text: string;
  glyph: string | null;
  glyphX: number;
}

/** Joins runs on one baseline into text. pdf.js already emits the spaces
 * between words (inside a run or as a run of their own), so runs are simply
 * concatenated: a word the PDF stores in pieces ("belt" + "s") stays one word.
 * Guessing spaces from run widths is unreliable, because the widths pdf.js
 * reports depend on the fonts of the machine it runs on. */
function joinRuns(runs: TextItem[]): string {
  return [...runs]
    .sort((a, b) => a.x - b.x)
    .map((r) => r.str)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds text lines from a page's runs, attaching each bullet glyph to the
 * line it sits on. Glyphs aren't always on their line's baseline: SL1/3/4 puts
 * them ~2.4pt below the first line's baseline, so match on nearest line. */
function buildLines(items: TextItem[], page: number, col = 0): Line[] {
  const glyphs: TextItem[] = [];
  const text: TextItem[] = [];
  for (const it of items) {
    const stripped = it.str.replace(PUA, '');
    if (it.str !== stripped && stripped.trim() === '') glyphs.push(it);
    else text.push({ ...it, str: stripped });
  }

  // Whitespace-only runs stay: they are the spaces between words.
  const rows: { y: number; runs: TextItem[] }[] = [];
  for (const it of [...text].filter((t) => t.str !== '').sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (row) row.runs.push(it);
    else rows.push({ y: it.y, runs: [it] });
  }
  const lines: Line[] = rows
    .filter((r) => r.runs.some((t) => t.str.trim() !== ''))
    .map((r) => ({
      page,
      col,
      y: r.y,
      x: Math.min(...r.runs.filter((t) => t.str.trim() !== '').map((t) => t.x)),
      text: joinRuns(r.runs),
      glyph: null,
      glyphX: 0,
    }));

  for (const g of glyphs) {
    const ch = g.str.match(PUA)?.[0];
    if (ch !== PASS && ch !== OTHER) continue;
    let best: Line | null = null;
    for (const l of lines) {
      if (Math.abs(l.y - g.y) <= 4.5 && (!best || Math.abs(l.y - g.y) < Math.abs(best.y - g.y))) best = l;
    }
    if (best && !best.glyph) {
      best.glyph = ch;
      best.glyphX = g.x;
    }
  }
  return lines.sort((a, b) => b.y - a.y);
}

/** Finds the page's column gutter: the middle of the widest gap between where
 * text *starts*, near the page centre. Uses start positions only, never run
 * widths, which vary with the machine's fonts. Null for a single column. */
function findGutter(items: TextItem[], width: number): number | null {
  const xs = [...new Set(items.filter((i) => i.str.trim() !== '').map((i) => Math.round(i.x)))].sort((a, b) => a - b);
  let best: { gap: number; mid: number } | null = null;
  for (let k = 1; k < xs.length; k++) {
    const gap = xs[k] - xs[k - 1];
    const mid = (xs[k] + xs[k - 1]) / 2;
    if (mid > width * 0.3 && mid < width * 0.7 && gap > 25 && (!best || gap > best.gap)) best = { gap, mid };
  }
  return best ? best.mid : null;
}

/** Joins wrapped lines. A trailing hyphen means the word continued ("up-to-" +
 * "date."), so no space goes in. */
function joinText(prev: string, next: string): string {
  if (!prev) return next;
  if (/[A-Za-z]-$/.test(prev) && /^[a-z0-9]/.test(next)) return prev + next;
  return prev + ' ' + next;
}

const cleanTitle = (s: string) => s.replace(/\s+/g, ' ').trim();

function readMeta(pages: PdfPage[], doc: ParsedDoc) {
  const top = pages[0].items.filter((i) => i.y > pages[0].height - 70 && i.str.trim() !== '');
  const headLines = buildLines(top, 1).map((l) => l.text);

  // A unit is three digits (CPF-573, CPF-376/377) or a placeholder like the 2-year
  // SLX document's "CPF-XXX", which is simply a unit called XXX.
  const unit = headLines.map((t) => /CPF-(\d{3}|XXX)(?:\s*[/&]\s*(?:CPF-)?(\d{3}))?/i.exec(t)).find(Boolean);
  if (unit) doc.unit = unit[2] ? `${unit[1]}/${unit[2]}` : unit[1].toUpperCase();

  // "Service Level 3 (500 hours)", "Service Level X (2 year)", or a bare "SLX". The
  // token is a whole number or up to three letters; anything longer isn't a level name.
  const levelText =
    headLines.find((t) => /Service Level/i.test(t)) ?? headLines.find((t) => /\bSL\s?(?:\d+|[A-Z]{1,3})\b/.test(t)) ?? '';
  const tok = (/Service Level\s*(\d+|[A-Za-z]{1,3})\b/i.exec(levelText) ?? /\bSL\s?(\d+|[A-Z]{1,3})\b/.exec(levelText))?.[1];
  if (tok && /^0+$/.test(tok)) {
    // SL0 is several documents, one per kind of check: "Outgoing Check, Service Level 0".
    const known = /Outgoing|Incoming|Rig\s*Up|Rig\s*Down/i.exec(levelText)?.[0].replace(/\s+/g, '').toLowerCase();
    const named = /^(.*?)\s*(?:Check\b|,)/i.exec(levelText)?.[1].replace(/[^A-Za-z0-9]+/g, '');
    doc.level =
      known === 'outgoing'
        ? 'Outgoing'
        : known === 'incoming'
          ? 'Incoming'
          : known === 'rigup'
            ? 'Rigup'
            : known === 'rigdown'
              ? 'RigDown'
              : named && named.length <= 24
                ? named
                : null;
    doc.group = 'SL0';
  } else if (tok) {
    doc.level = `SL${tok.toUpperCase()}`;
    // Numbered levels (SL1, SL2, SL10) belong with SL1/3/4. A lettered one (SLX)
    // is a service level of its own: parseDocument gives it a group named after it.
    doc.group = /^\d+$/.test(tok) ? 'SL1/3/4' : null;
  }

  for (const p of pages) {
    const foot = p.items.filter((i) => i.y < FOOTER_BAND).map((i) => i.str).join(' ');
    const v = /(?:V|Rev\.?\s*)\d+(?:\.\d+)?,?\s*\d{1,2}-[A-Za-z]{3}-\d{2}/.exec(foot);
    if (v) {
      doc.version = v[0];
      break;
    }
  }
}

/** Body lines in reading order: header/footer/boilerplate dropped, page 1's
 * intro cut off at "Checks", and everything from the sign-off block on dropped.
 * `columns` reads each page's left column then its right column (SL0). The page
 * is trimmed to the checks area first, because the intro and sign-off text span
 * both columns and would hide the gutter. */
function bodyLines(pages: PdfPage[], columns: boolean, warnings: string[]): Line[] {
  const out: Line[] = [];
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    let items = page.items.filter((i) => i.y < page.height - HEADER_BAND && i.y > FOOTER_BAND);

    if (p === 0) {
      const checks = items.find((i) => i.str.trim() === 'Checks' && i.x < 100);
      if (checks) items = items.filter((i) => i.y < checks.y + CHECKS_SLACK && i !== checks);
      else warnings.push('Could not find the "Checks" heading on page 1.');
    }
    const stopLine = buildLines(items, p + 1).find((l) => STOP.test(l.text));
    if (stopLine) items = items.filter((i) => i.y > stopLine.y + (/Deficiency/.test(stopLine.text) ? STOP_PAD : 1));

    let groups: TextItem[][] = [items];
    if (columns) {
      const gutter = findGutter(items, page.width);
      if (gutter !== null) groups = [items.filter((i) => i.x < gutter), items.filter((i) => i.x >= gutter)];
    }
    for (const [col, g] of groups.entries()) {
      for (const l of buildLines(g, p + 1, col)) {
        if (!SKIP.test(l.text)) out.push(l);
      }
    }
    if (stopLine) break;
  }
  return out;
}

function parseBanded(lines: Line[], doc: ParsedDoc) {
  const glyphLines = lines.filter((l) => l.glyph === PASS && l.glyphX > 450);
  const itemX = glyphLines.length ? Math.min(...glyphLines.map((l) => l.x)) : 60;
  let band: string | null = null;
  let secNo = 0;
  let secName = '';
  let item: ParsedItem | null = null;

  for (const l of lines) {
    const b = BAND.exec(l.text);
    if (b) {
      band = `WO #${b[1]}: ${cleanTitle(b[2])}`;
      item = null;
      continue;
    }
    const s = SECTION.exec(l.text);
    if (s && Number(s[1]) === secNo + 1 && !l.glyph && l.x < itemX - 5) {
      secNo = Number(s[1]);
      secName = cleanTitle(s[2]);
      item = null;
      continue;
    }
    if (l.glyph === PASS && l.glyphX > 450) {
      item = { sectionNo: secNo, sectionName: secName, band, text: l.text, options: [], page: l.page };
      doc.items.push(item);
    } else if (item) {
      item.text = joinText(item.text, l.text);
    }
    // Otherwise: a callout box or note between a heading and its first check.
    // It isn't a check, and the marker count below catches any real miss.
  }

  const expected = glyphLines.length;
  if (doc.items.length !== expected) doc.warnings.push(`Found ${doc.items.length} checks but ${expected} item markers.`);
}

/** Layout with no item markers (the 2-year SLX document): numbered sections, no
 * bands, and nothing but spacing to say where a check starts. Lines inside a
 * check sit one line-pitch apart; a note or list item sits a little further
 * (~1.3x); a new check a lot further (1.6x and up). The threshold is taken from
 * the document's own line pitch. This is inference, not a count, so the result is
 * flagged for review. */
function parseSpaced(lines: Line[], doc: ParsedDoc, pages: PdfPage[]) {
  const gaps: number[] = [];
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev && prev.page === l.page && prev.y - l.y > 0 && prev.y - l.y < 12) gaps.push(prev.y - l.y);
  });
  gaps.sort((a, b) => a - b);
  const itemGap = (gaps.length ? gaps[Math.floor(gaps.length / 2)] : 10.3) * 1.5;

  // Body text starts at one x; section headings sit left of it.
  const starts = new Map<number, number>();
  for (const l of lines) if (!SECTION.test(l.text)) starts.set(Math.round(l.x), (starts.get(Math.round(l.x)) ?? 0) + 1);
  const itemX = [...starts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 60;

  let band: string | null = null;
  let secNo = 0;
  let secName = '';
  let item: ParsedItem | null = null;
  let byRules = 0;
  let bySpacing = 0;
  let atPageTop = 0;

  lines.forEach((l, i) => {
    const b = BAND.exec(l.text);
    if (b) {
      band = `WO #${b[1]}: ${cleanTitle(b[2])}`;
      item = null;
      return;
    }
    const s = SECTION.exec(l.text);
    if (s && Number(s[1]) === secNo + 1 && l.x < itemX - 5) {
      secNo = Number(s[1]);
      secName = cleanTitle(s[2]);
      item = null;
      return;
    }
    if (!secNo) return;

    const prev = lines[i - 1];
    const sameBlock = !!prev && prev.page === l.page;
    const isNote = /^Note:/i.test(l.text);
    // Where the page draws a line between table rows, a check starts where a line
    // lies between two text lines, and nowhere else: one row can hold several
    // paragraphs. Without row lines, fall back to the gap between lines. At the top
    // of a page there is neither: a capitalised line after a finished sentence
    // starts a check; a lower-case one carries on.
    const rules = pages[l.page - 1]?.rules ?? [];
    let startsCheck: boolean;
    if (!item) startsCheck = true;
    else if (sameBlock && rules.length) {
      startsCheck = rules.some((r) => r < prev.y && r > l.y + 5);
      byRules++;
    } else if (sameBlock) {
      startsCheck = !isNote && prev.y - l.y >= itemGap;
      bySpacing++;
    } else {
      startsCheck = !isNote && /^[A-Z]/.test(l.text) && /[.!?:)]$|\d$/.test(item.text.trimEnd());
      atPageTop++;
    }
    if (startsCheck) {
      item = { sectionNo: secNo, sectionName: secName, band, text: l.text, options: [], page: l.page };
      doc.items.push(item);
    } else if (item) {
      item.text = joinText(item.text, l.text);
    }
  });

  if (doc.items.length) {
    const circle = 'The other InTouch documents have a small OK circle beside every check, which lets the app count them exactly. This one does not';
    doc.warnings.push(
      byRules && !bySpacing
        ? `${circle}, so the app used the lines drawn between the table's rows to tell where each check starts${atPageTop ? ' (a check that carries over a page break is joined by guesswork)' : ''}. Skim the list to make sure each check looks whole.`
        : `${circle}, so the app started a new check wherever the gap between lines got bigger. Skim the list to make sure each check looks whole.`,
    );
  }
}

function parseOptions(lines: Line[], doc: ParsedDoc) {
  let secNo = 0;
  let secName = '';
  let item: ParsedItem | null = null;
  let optionX = 0;
  let lastOption: Option | null = null;
  let colKey = '';
  let titleX = 0;

  for (const l of lines) {
    // A new column starts a new check unless the open one is still waiting for
    // its first option.
    const key = `${l.page}:${l.col}`;
    if (key !== colKey) {
      colKey = key;
      if (item?.options.length) {
        item = null;
        lastOption = null;
      }
    }

    if (l.glyph) {
      if (!item) {
        doc.warnings.push(`Answer option with no check above it (page ${l.page}): "${l.text.slice(0, 50)}"`);
        continue;
      }
      lastOption = { t: l.text, bad: l.glyph === OTHER };
      item.options.push(lastOption);
      optionX = l.x;
      continue;
    }

    const s = SECTION.exec(l.text);
    if (s && Number(s[1]) === secNo + 1 && /^[A-Z]/.test(s[2]) && !/[.:]$/.test(s[2]) && !(item && lastOption && l.x >= optionX - 2)) {
      secNo = Number(s[1]);
      secName = cleanTitle(s[2]);
      item = null;
      lastOption = null;
      continue;
    }

    // Wrapped text of the current option sits as deep as the option's text.
    if (item && lastOption && l.x >= optionX - 2) {
      lastOption.t = joinText(lastOption.t, l.text);
      continue;
    }
    // A note that trails the options belongs to the step, not a new check.
    if (item && lastOption && /^Note:/i.test(l.text)) {
      item.text = joinText(item.text, l.text);
      continue;
    }
    if (item && !lastOption) {
      // A floating callout ("WORKING AT HEIGHT!") sits indented between a title
      // and its options. Wrapped title lines and notes share the title's indent.
      if (l.x <= titleX + 20) item.text = joinText(item.text, l.text);
      continue;
    }
    titleX = l.x;
    item = { sectionNo: secNo, sectionName: secName, band: null, text: l.text, options: [], page: l.page };
    lastOption = null;
    doc.items.push(item);
  }

  for (const it of doc.items) {
    const pass = it.options.filter((o) => !o.bad).length;
    if (!it.options.length) doc.warnings.push(`No answer options found for "${it.text.slice(0, 50)}".`);
    else if (pass !== 1) doc.warnings.push(`${pass} pass options for "${it.text.slice(0, 50)}".`);
  }
}

/** Parses one document. Never throws on layout surprises: it records them as
 * warnings so the import preview can show them. */
export function parseDocument(pages: PdfPage[], fileName: string): ParsedDoc {
  const doc: ParsedDoc = { fileName, unit: null, level: null, group: null, version: null, items: [], warnings: [] };
  if (!pages.length) {
    doc.warnings.push('The PDF has no pages.');
    return doc;
  }
  readMeta(pages, doc);
  if (!doc.unit) doc.warnings.push('Could not read the unit from the title.');
  if (!doc.level) doc.warnings.push('Could not read the service level from the title.');

  // The layout, not the title, decides how to read the body: bulleted answers
  // (SL0), a marker on each check (SL1/3/4), or neither (spacing only).
  const probe = bodyLines(pages, false, []);
  const markers = probe.filter((l) => l.glyph === PASS && l.glyphX > 450).length;
  const bullets = probe.filter((l) => l.glyph && l.glyphX <= 450).length;
  const layout = markers > bullets ? 'markers' : bullets > 0 ? 'options' : 'spacing';
  // A lettered level (SLX) is a service level in its own right: it gets a group
  // (a matrix tab) named after it, unless its layout is SL0's.
  if (!doc.group) doc.group = layout === 'options' ? 'SL0' : (doc.level ?? 'SL1/3/4');

  const lines = bodyLines(pages, layout === 'options', doc.warnings);
  if (layout === 'options') parseOptions(lines, doc);
  else if (layout === 'markers') parseBanded(lines, doc);
  else parseSpaced(lines, doc, pages);
  if (!doc.items.length) doc.warnings.push('No checks were found in this PDF. Is it an InTouch ACP document?');
  return doc;
}
