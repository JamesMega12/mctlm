import { describe, expect, it } from 'vitest';
import type { Check, Section } from '../../types';
import { applyPlan, type MasterDraft } from './apply.ts';
import { markChanged } from './diff.ts';
import { buildPlan, normText } from './match.ts';
import { parseDocument } from './parse.ts';
import type { PdfPage, TextItem } from './types.ts';

// Hand-built pages stand in for the real InTouch PDFs, which are SLB-internal
// and not kept in this repo. Positions mimic what pdf.js reports: y runs up
// the page, headers sit above y=707, footers below y=45.

const PASS = '';
const OTHER = '';
const t = (x: number, y: number, str: string): TextItem => ({ str, x, y, w: str.length * 4.5, h: 9 });
const glyph = (x: number, y: number, ch: string): TextItem => ({ str: ch, x, y, w: 8, h: 14 });
/** The run of spaces pdf.js emits between separately positioned words. */
const sp = (x: number, y: number): TextItem => ({ str: ' ', x, y, w: 3, h: 0 });
const page = (...items: TextItem[]): PdfPage => ({ width: 612, height: 792, items });

const header = (title: string, level: string): TextItem[] => [
  t(29, 758, title),
  t(29, 741, level),
  t(450, 722, 'Well Construction Fluids'),
  t(29, 29, 'Controlled document.'),
  t(527, 20, 'V4.1, 14-Aug-26'),
];

describe('parseDocument: SL1/3/4 (banded, one marker per check)', () => {
  const doc = parseDocument(
    [
      page(
        ...header('CPF-573 Cement Pump Float', 'Service Level 3 (500 hours)'),
        t(31, 600, 'Checks'),
        t(32, 575, 'Systems and Components'),
        t(36, 555, 'Task Line #1: Common-Pre'),
        t(44, 535, '1'),
        sp(50, 535),
        t(60, 535, 'General'),
        t(60, 515, 'Examine the belts. Replace them if the condition is bad.'),
        glyph(540, 513, PASS),
        t(60, 480, 'Check the pressure is between 60 to 65'),
        glyph(540, 478, PASS),
        t(60, 468, 'psi and up-to-'),
        t(60, 458, 'date.'),
        t(60, 440, 'Note: Wear gloves.'),
        t(36, 410, 'Task Line #2: Mechanical'),
        t(44, 390, '2'),
        sp(50, 390),
        t(60, 390, 'Engine'),
        t(60, 370, 'Replace the air filter.'),
        glyph(540, 368, PASS),
        t(32, 300, 'Equipment status and signatures'),
        t(60, 280, 'Ignored sign-off text'),
      ),
    ],
    'sl3.pdf',
  );

  it('reads unit, level and version from the title and footer', () => {
    expect(doc.unit).toBe('573');
    expect(doc.level).toBe('SL3');
    expect(doc.group).toBe('SL1/3/4');
    expect(doc.version).toBe('V4.1, 14-Aug-26');
  });

  it('starts one check at each marker and folds continuation lines and notes into it', () => {
    expect(doc.items.map((i) => i.text)).toEqual([
      'Examine the belts. Replace them if the condition is bad.',
      'Check the pressure is between 60 to 65 psi and up-to-date. Note: Wear gloves.',
      'Replace the air filter.',
    ]);
  });

  it('tracks band and section, and stops at the sign-off block', () => {
    expect(doc.items.map((i) => [i.band, i.sectionNo, i.sectionName])).toEqual([
      ['WO #1: Common-Pre', 1, 'General'],
      ['WO #1: Common-Pre', 1, 'General'],
      ['WO #2: Mechanical', 2, 'Engine'],
    ]);
    expect(doc.warnings).toEqual([]);
  });
});

describe('parseDocument: SL0 (two columns, bulleted answers)', () => {
  const left = 44;
  const right = 346;
  const doc = parseDocument(
    [
      page(
        ...header('CPF-376/377 Cement Pump Float', 'Outgoing Check, Service Level 0'),
        t(31, 600, 'Checks'),
        t(left, 560, '1'),
        sp(50, 560),
        t(60, 560, 'General'),
        t(60, 540, 'Unit'),
        glyph(60, 520, PASS),
        t(78, 521, 'Good condition'),
        glyph(60, 508, OTHER),
        t(78, 509, 'Leaks or damaged'),
        glyph(60, 496, OTHER),
        t(78, 497, 'Other defect'),
        // A floating callout sits indented between a title and its options.
        t(60, 470, 'All belts on unit'),
        t(121, 455, 'WORKING AT HEIGHT!'),
        glyph(60, 440, PASS),
        t(78, 441, 'Good condition & tight'),
        glyph(60, 428, OTHER),
        t(78, 429, 'Loose, wrapped'),
        t(78, 419, 'onto a second line'),
        // Right column opens a new check.
        t(right, 560, 'Safety equipment'),
        glyph(right, 540, PASS),
        t(right + 18, 541, 'Available'),
        glyph(right, 528, OTHER),
        t(right + 18, 529, 'Missing'),
        t(right - 16, 500, '2'),
        sp(right - 10, 500),
        t(right, 500, 'Certification'),
        t(right, 480, 'All PRVs'),
        glyph(right, 460, PASS),
        t(right + 18, 461, 'Valid'),
      ),
    ],
    'sl0.pdf',
  );

  it('reads the unit "376/377" and the SL0 level from the title', () => {
    expect(doc.unit).toBe('376/377');
    expect(doc.level).toBe('Outgoing');
    expect(doc.group).toBe('SL0');
  });

  it('splits columns, keeps option order, and marks U+F099 as the pass answer', () => {
    expect(doc.items.map((i) => i.text)).toEqual(['Unit', 'All belts on unit', 'Safety equipment', 'All PRVs']);
    expect(doc.items[0].options).toEqual([
      { t: 'Good condition', bad: false },
      { t: 'Leaks or damaged', bad: true },
      { t: 'Other defect', bad: true },
    ]);
  });

  it('joins wrapped option text, ignores callouts, and starts a new check in a new column', () => {
    expect(doc.items[1].options[1].t).toBe('Loose, wrapped onto a second line');
    expect(doc.items[1].text).toBe('All belts on unit');
    expect(doc.items[2].sectionName).toBe('General');
    expect(doc.items[3].sectionName).toBe('Certification');
    expect(doc.warnings).toEqual([]);
  });
});

describe('normText', () => {
  it('ignores case, spacing and dash or quote glyph variants, and nothing else', () => {
    expect(normText('  Make sure the\n  “valve” – open ')).toBe('make sure the "valve" - open');
    expect(normText('Five- Point')).not.toBe(normText('Five-Point'));
  });
});

describe('markChanged', () => {
  it('flags whole words the other wording lacks and never splits a word', () => {
    const parts = markChanged('All belts on unit Note: See InTouch ID# 7031210.', 'All belts on unit Note: See InTouch 7031210.');
    expect(parts.map((p) => p.t).join('')).toBe('All belts on unit Note: See InTouch ID# 7031210.');
    expect(parts.filter((p) => p.changed).map((p) => p.t)).toEqual(['ID#']);
  });
});

describe('parseDocument: independence from text widths', () => {
  // A word the PDF stores in pieces ("belt" + "s", no space run between), and
  // the same page measured with very different run widths, as another machine's
  // fonts would report them. The text and the SL0 columns must not change.
  const build = (scale: number) =>
    parseDocument(
      [
        page(
          ...header('CPF-573 Cement Pump Float', 'Outgoing Check, Service Level 0'),
          t(31, 600, 'Checks'),
          t(44, 560, '1'),
          sp(50, 560),
          t(60, 560, 'General'),
          t(60, 540, 'All belt'),
          t(60 + 8 * 4.5, 540, 's on unit'),
          glyph(60, 520, PASS),
          t(78, 521, 'Good condition'),
          glyph(60, 508, OTHER),
          t(78, 509, 'Loose'),
          t(346, 560, 'Safety equipment'),
          glyph(346, 540, PASS),
          t(364, 541, 'Available'),
        ),
      ].map((p) => ({ ...p, items: p.items.map((i) => ({ ...i, w: i.w * scale })) })),
      'sl0.pdf',
    );

  it.each([0.5, 1, 2.5])('reads the same text at width scale %s', (scale) => {
    const doc = build(scale);
    expect(doc.items.map((i) => i.text)).toEqual(['All belts on unit', 'Safety equipment']);
    expect(doc.items[0].options).toHaveLength(2);
    expect(doc.warnings).toEqual([]);
  });
});

const chk = (id: number, s: number, n: string, g: string, rows: [string, string][] = []): Check => ({
  id,
  s,
  n,
  o: [],
  swi: false,
  c: '',
  g,
  rows: rows.map(([u, l]) => ({ u, s: l })),
  history: [],
});

const master = (): MasterDraft => ({
  checks: [
    chk(0, 0, 'Replace the air filter.', 'SL1/3/4', [['573', 'SL3']]),
    chk(1, 0, 'Examine the belts.', 'SL1/3/4', [['573', 'SL3']]),
    chk(2, 1, 'Drain the tank', 'SL1/3/4', []),
    chk(3, 0, 'Replace the air filter.', 'SL1/3/4', []),
  ],
  sections: [
    { id: 0, name: 'Engine', wo: 'WO #2: Mechanical', g: 'SL1/3/4' },
    { id: 1, name: 'General', wo: 'WO #1: Common Pre', g: 'SL1/3/4' },
  ] satisfies Section[],
  units: ['573'],
  addedUnits: [],
  levels: { SL0: ['Outgoing'], 'SL1/3/4': ['SL1', 'SL3'] },
  nextCheckId: 4,
  nextSectionId: 2,
});

/** A parsed SL3 document for 573. Bands are written as printed ("Task Line #2:
 * ...") and normalised to "WO #2: ..." the way parse.ts does. */
const parsed = (items: [string, string, string][]) => ({
  fileName: 'doc.pdf',
  unit: '573',
  level: 'SL3',
  group: 'SL1/3/4',
  version: 'V1.0, 1-Jan-26',
  warnings: [],
  items: items.map(([band, sectionName, text], i) => ({
    sectionNo: i + 1,
    sectionName,
    band: band.replace(/^Task Line/, 'WO'),
    text,
    options: [],
    page: 1,
  })),
});

describe('buildPlan', () => {
  it('matches by identical wording within the right section and WO, and claims each check once', () => {
    const plan = buildPlan(
      parsed([
        ['Task Line #2: Mechanical', 'Engine', 'replace the  air filter.'],
        ['Task Line #2: Mechanical', 'Engine', 'Replace the air filter.'],
      ]),
      master(),
    );
    expect(plan.items.map((i) => [i.checkId, i.via])).toEqual([
      [0, 'exact'],
      [3, 'exact'],
    ]);
  });

  it('matches wording filed under another section only when unambiguous', () => {
    const plan = buildPlan(parsed([['Task Line #1: Common-Pre', 'General', 'Examine the belts.']]), master());
    expect(plan.items[0]).toMatchObject({ checkId: 1, via: 'elsewhere' });
  });

  it('suggests, but never merges, a close wording', () => {
    const plan = buildPlan(parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank.']]), master());
    expect(plan.items[0].checkId).toBeNull();
    expect(plan.items[0].suggestion?.checkId).toBe(2);
  });

  it('lists checks ticked for this document that it no longer contains', () => {
    const plan = buildPlan(parsed([['Task Line #2: Mechanical', 'Engine', 'Replace the air filter.']]), master());
    expect(plan.missingIds).toEqual([1]);
  });

  it('blocks a document whose unit or level could not be read', () => {
    const doc = { ...parsed([]), unit: null, level: null };
    expect(buildPlan(doc, master()).blockers.length).toBeGreaterThan(0);
  });
});

describe('applyPlan', () => {
  const run = (data: MasterDraft, doc: ReturnType<typeof parsed>, over: Partial<Parameters<typeof applyPlan>[2]> = {}) => {
    const plan = buildPlan(doc, data);
    return applyPlan(data, plan, { decisions: {}, untickMissing: false, when: '2026-10-13', who: 'test', ...over });
  };

  it('ticks matches, adds new checks and creates a missing section under the matching WO', () => {
    const data = master();
    const r = run(
      data,
      parsed([
        ['Task Line #2: Mechanical', 'Engine', 'Drain the sump.'],
        ['Task Line #4: Common-Post', 'Run Checks', 'Test the unit.'],
        ['Task Line #1: Common-Pre', 'General', 'Drain the tank'],
      ]),
    );
    expect(r).toMatchObject({ created: 2, ticked: 1, sectionsCreated: 1 });
    expect(data.sections.at(-1)).toMatchObject({ name: 'Run Checks', wo: 'WO #4: Common-Post', g: 'SL1/3/4' });
    expect(data.checks.find((c) => c.n === 'Drain the tank')?.rows).toEqual([{ u: '573', s: 'SL3' }]);
    expect(data.nextCheckId).toBe(6);
  });

  it('is idempotent: importing the same document twice changes nothing the second time', () => {
    const data = master();
    const doc = parsed([
      ['Task Line #2: Mechanical', 'Engine', 'Drain the sump.'],
      ['Task Line #1: Common-Pre', 'General', 'Drain the tank'],
    ]);
    run(data, doc);
    const snapshot = JSON.stringify(data);
    const again = run(data, doc);
    expect(again).toMatchObject({ created: 0, ticked: 0, unticked: 0, sectionsCreated: 0 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('links a reworded check, remembers the wording, then matches it by itself next time', () => {
    const data = master();
    const doc = parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank.']]);
    const plan = buildPlan(doc, data);
    applyPlan(data, plan, { decisions: { 0: { link: 2 } }, untickMissing: false, when: 'd', who: 'w' });
    expect(data.checks.find((c) => c.id === 2)).toMatchObject({ alias: ['Drain the tank.'], rows: [{ u: '573', s: 'SL3' }] });
    expect(buildPlan(doc, data).items[0]).toMatchObject({ checkId: 2, via: 'alias' });
  });

  it('unticks checks missing from the document only when asked', () => {
    const doc = parsed([['Task Line #2: Mechanical', 'Engine', 'Replace the air filter.']]);
    const kept = master();
    expect(run(kept, doc).unticked).toBe(0);
    expect(kept.checks[1].rows).toHaveLength(1);

    const data = master();
    expect(run(data, doc, { untickMissing: true }).unticked).toBe(1);
    expect(data.checks[1].rows).toEqual([]);
  });

  it('adds an unknown unit and level', () => {
    const data = master();
    run(data, { ...parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank']]), unit: '999', level: 'SL4' });
    expect(data.units).toContain('999');
    expect(data.addedUnits).toContain('999');
    expect(data.levels['SL1/3/4']).toContain('SL4');
  });

  it('skips items the user skipped', () => {
    const data = master();
    const doc = parsed([['Task Line #2: Mechanical', 'Engine', 'Brand new check.']]);
    const plan = buildPlan(doc, data);
    const r = applyPlan(data, plan, { decisions: { 0: 'skip' }, untickMissing: false, when: 'd', who: 'w' });
    expect(r).toMatchObject({ created: 0, skipped: 1 });
  });
});
