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

  it('replaces a check with the document\'s wording, keeping the old wording as an alias and logging it', () => {
    const data = master();
    const doc = parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank.']]);
    const r = applyPlan(data, buildPlan(doc, data), { decisions: { 0: { replace: 2 } }, untickMissing: false, when: 'd', who: 'w' });
    const c = data.checks.find((x) => x.id === 2)!;
    expect(r).toMatchObject({ replaced: 1, created: 0, ticked: 1 });
    expect(c.n).toBe('Drain the tank.');
    expect(c.alias).toEqual(['Drain the tank']);
    expect(c.rows).toEqual([{ u: '573', s: 'SL3' }]);
    expect(c.history.some((h) => h.what.includes('Replaced') && h.what.includes('Drain the tank'))).toBe(true);
    // Documents that still say the old wording, and ones that say the new, both match it.
    expect(buildPlan(parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank']]), data).items[0]).toMatchObject({ checkId: 2, via: 'alias' });
    expect(buildPlan(doc, data).items[0]).toMatchObject({ checkId: 2, via: 'exact' });
  });

  it('replaces the answers too on SL0, and leaves them alone elsewhere', () => {
    const data = master();
    data.levels.SL0 = ['Outgoing'];
    data.sections.push({ id: 2, name: 'General', wo: 'SL0', g: 'SL0' });
    data.checks.push({ ...chk(10, 2, 'Check the unit', 'SL0', [['573', 'Outgoing']]), o: [{ t: 'Old answer', bad: false }] });
    const answers = [
      { t: 'New good', bad: false },
      { t: 'New bad', bad: true },
    ];
    const doc = {
      ...parsed([]),
      level: 'Outgoing',
      group: 'SL0',
      items: [{ sectionNo: 1, sectionName: 'General', band: null, text: 'Check the unit.', options: answers, page: 1 }],
    };
    applyPlan(data, buildPlan(doc, data), { decisions: { 0: { replace: 10 } }, untickMissing: false, when: 'd', who: 'w' });
    expect(data.checks.find((x) => x.id === 10)).toMatchObject({ n: 'Check the unit.', o: answers });

    const banded = master();
    banded.checks[2].o = [{ t: 'Kept', bad: false }];
    applyPlan(banded, buildPlan(parsed([['Task Line #1: Common-Pre', 'General', 'Drain the tank.']]), banded), {
      decisions: { 0: { replace: 2 } },
      untickMissing: false,
      when: 'd',
      who: 'w',
    });
    expect(banded.checks[2].o).toEqual([{ t: 'Kept', bad: false }]);
  });

  it('skips items the user skipped', () => {
    const data = master();
    const doc = parsed([['Task Line #2: Mechanical', 'Engine', 'Brand new check.']]);
    const plan = buildPlan(doc, data);
    const r = applyPlan(data, plan, { decisions: { 0: 'skip' }, untickMissing: false, when: 'd', who: 'w' });
    expect(r).toMatchObject({ created: 0, skipped: 1 });
  });
});

describe('service level and unit titles', () => {
  const levelOf = (title: string, levelLine: string) => {
    const doc = parseDocument([page(...header(title, levelLine), t(31, 600, 'Checks'))], 'x.pdf');
    return { unit: doc.unit, level: doc.level, group: doc.group };
  };

  it('reads a numbered level in full, so SL10 is not mistaken for SL1', () => {
    expect(levelOf('CPF-573 Cement Pump Float', 'Service Level 10 (5000 hours)')).toMatchObject({ level: 'SL10', group: 'SL1/3/4' });
    expect(levelOf('CPF-573 Cement Pump Float', 'Service Level 2 (250 hours)')).toMatchObject({ level: 'SL2', group: 'SL1/3/4' });
  });

  it('reads a lettered level such as SLX, which is a service level (and group) of its own', () => {
    expect(levelOf('CPF-573 Cement Pump Float', 'Service Level X (2 year)')).toMatchObject({ level: 'SLX', group: 'SLX' });
    expect(levelOf('CPF-573 Cement Pump Float', 'SLX Service')).toMatchObject({ level: 'SLX' });
  });

  it('names an unfamiliar SL0 check type from its title', () => {
    expect(levelOf('CPF-573 Cement Pump Float', 'Pre-Job Check, Service Level 0')).toMatchObject({ level: 'PreJob', group: 'SL0' });
    expect(levelOf('CPF-573 Cement Pump Float', 'Rig Up & Spot Check, Service Level 0')).toMatchObject({ level: 'Rigup' });
  });

  it('reads a "CPF-XXX" title as a unit called XXX', () => {
    expect(levelOf('CPF-XXX', 'Service Level X (2 year)')).toMatchObject({ unit: 'XXX', level: 'SLX', group: 'SLX' });
    expect(levelOf('CPF-637 Cement Pump Float', 'Service Level 3')).toMatchObject({ unit: '637' });
  });
});

describe('parseDocument: no item markers (the 2-year SLX layout)', () => {
  const pitch = 10.3;
  // Lines inside a check sit one pitch apart; a note sits ~1.3 pitches; a new check ~1.9.
  const doc = parseDocument(
    [
      page(
        ...header('CPF-XXX', 'Service Level X (2 year)'),
        t(31, 600, 'Checks'),
        t(32, 580, 'Systems and Components'),
        t(44, 560, '1'),
        sp(50, 560),
        t(61, 560, 'General'),
        t(61, 540, 'Clear the loose debris from all the lines and'),
        t(61, 540 - pitch, 'fittings.'),
        t(61, 540 - pitch - 19, 'Do a close check of each part.'),
        t(61, 540 - pitch - 19 - 13.3, 'Note: See the register.'),
        t(61, 540 - pitch - 19 - 13.3 - pitch, 'InTouch 1234567 .'),
        t(61, 450, 'Replace the filter.'),
        t(44, 420, '2'),
        sp(50, 420),
        t(61, 420, 'Engine'),
        t(61, 400, 'Service the first unit.'),
        t(61, 380, 'Service the second unit.'),
        t(32, 300, 'Equipment status and signatures'),
      ),
    ],
    'slx.pdf',
  );

  it('starts a check after a larger gap, and folds notes and wrapped lines into the check above', () => {
    expect(doc.items.map((i) => i.text)).toEqual([
      'Clear the loose debris from all the lines and fittings.',
      'Do a close check of each part. Note: See the register. InTouch 1234567 .',
      'Replace the filter.',
      'Service the first unit.',
      'Service the second unit.',
    ]);
    expect(doc.items.map((i) => [i.sectionNo, i.sectionName, i.band])).toEqual([
      [1, 'General', null],
      [1, 'General', null],
      [1, 'General', null],
      [2, 'Engine', null],
      [2, 'Engine', null],
    ]);
  });

  it('makes the level its own group and reads the unit as XXX', () => {
    expect(doc).toMatchObject({ level: 'SLX', group: 'SLX', unit: 'XXX' });
    expect(doc.warnings.some((w) => w.includes('OK circle') && w.includes('new check'))).toBe(true);
  });
});

describe('parseDocument: rows drawn as table lines', () => {
  // The same page as the spacing test, but with the table's row lines. Row 1
  // holds two paragraphs a big gap apart: spacing alone would split it in two,
  // the row lines say it is one check.
  const doc = (rules: number[]) =>
    parseDocument(
      [
        {
          ...page(
            ...header('CPF-XXX', 'Service Level X (2 year)'),
            t(31, 600, 'Checks'),
            t(32, 590, 'Systems and Components'),
            t(44, 570, '1'),
            sp(50, 570),
            t(61, 570, 'General'),
            t(61, 550, 'Do a close check of each cable.'),
            t(61, 520, 'Read the document and examine the cables.'),
            t(61, 500, 'Replace the filter.'),
            t(61, 460, 'Service the second unit.'),
            t(32, 300, 'Equipment status and signatures'),
          ),
          rules,
        },
      ],
      'slx.pdf',
    );

  it('starts a check only where a row line falls between two text lines', () => {
    // Row lines under the section bar, between row 1 and 2 (y=510), and between 2 and 3 (y=475).
    const d = doc([560, 510, 475]);
    expect(d.items.map((i) => i.text)).toEqual([
      'Do a close check of each cable. Read the document and examine the cables.',
      'Replace the filter.',
      'Service the second unit.',
    ]);
  });

  it('says it used the row lines, and falls back to spacing (with the old warning) when the page has none', () => {
    expect(doc([560, 510, 475]).warnings.join(' ')).toContain("lines drawn between the table's rows");
    const spaced = doc([]);
    expect(spaced.items.length).toBeGreaterThan(3);
    expect(spaced.warnings.join(' ')).toContain('gap between lines');
  });
});

describe('a new service level of its own (SLX)', () => {
  const own = {
    ...parsed([]),
    unit: '573',
    level: 'SLX',
    group: 'SLX',
    items: [{ sectionNo: 1, sectionName: 'Engine', band: null, text: 'Service the second unit.', options: [], page: 1 }],
  };

  it('creates the level and its own group (a matrix tab), with its sections under a heading of the same name', () => {
    const data = master();
    const plan = buildPlan(own, data);
    expect(plan).toMatchObject({ createsLevel: true, createsGroup: true, group: 'SLX' });

    applyPlan(data, plan, { decisions: {}, untickMissing: false, when: 'd', who: 'w' });
    expect(data.levels).toMatchObject({ SLX: ['SLX'], 'SL1/3/4': ['SL1', 'SL3'] });
    expect(data.sections.at(-1)).toMatchObject({ name: 'Engine', wo: 'SLX', g: 'SLX' });
    expect(data.checks.at(-1)).toMatchObject({ g: 'SLX', rows: [{ u: '573', s: 'SLX' }] });
  });

  it('does not borrow checks from other groups: the same wording is a new check in its own group', () => {
    const data = master();
    const doc = { ...own, items: [{ ...own.items[0], text: 'Examine the belts.' }] };
    const plan = buildPlan(doc, data);
    expect(plan.items[0].checkId).toBeNull();
  });

  it('matches its own checks on the next import, and no longer creates anything', () => {
    const data = master();
    applyPlan(data, buildPlan(own, data), { decisions: {}, untickMissing: false, when: 'd', who: 'w' });
    const again = buildPlan({ ...own, unit: '573' }, data);
    expect(again).toMatchObject({ createsLevel: false, createsGroup: false, group: 'SLX' });
    expect(again.items[0]).toMatchObject({ via: 'exact', alreadyIn: true });
  });

});

describe('importing a level and unit that do not exist yet', () => {
  const slx = {
    ...parsed([]),
    unit: '573',
    level: 'SLX',
    group: 'SL1/3/4',
    items: [
      { sectionNo: 1, sectionName: 'Engine', band: null, text: 'Service the second unit.', options: [], page: 1 },
      { sectionNo: 1, sectionName: 'Engine', band: null, text: 'Examine the belts.', options: [], page: 1 },
    ],
  };

  it('creates the level, ticks an existing check, and files new checks under a heading named for the level', () => {
    const data = master();
    const plan = buildPlan(slx, data);
    expect(plan).toMatchObject({ createsLevel: true, group: 'SL1/3/4', level: 'SLX' });
    expect(plan.items[1]).toMatchObject({ checkId: 1, via: 'elsewhere' });

    const r = applyPlan(data, plan, { decisions: {}, untickMissing: false, when: 'd', who: 'w' });
    expect(r).toMatchObject({ created: 1, ticked: 1, sectionsCreated: 1 });
    expect(data.levels['SL1/3/4']).toContain('SLX');
    // Not the WO #2 "Engine" section that already exists: SLX has no bands of its own.
    expect(data.sections.at(-1)).toMatchObject({ name: 'Engine', wo: 'SLX', g: 'SL1/3/4' });
    expect(data.checks.find((c) => c.id === 1)?.rows).toContainEqual({ u: '573', s: 'SLX' });
  });

  it('creates the unit XXX as well as the level, and ticks its checks for it', () => {
    const data = master();
    const plan = buildPlan({ ...slx, unit: 'XXX' }, data);
    expect(plan).toMatchObject({ createsUnit: true, createsLevel: true });

    applyPlan(data, plan, { decisions: {}, untickMissing: false, when: 'd', who: 'w' });
    expect(data.units).toEqual(['573', 'XXX']);
    expect(data.addedUnits).toEqual(['XXX']);
    expect(data.checks.at(-1)).toMatchObject({ rows: [{ u: 'XXX', s: 'SLX' }] });
  });

  it('still blocks a document whose unit could not be read at all', () => {
    expect(buildPlan({ ...slx, unit: null }, master()).blockers).toEqual(['The unit could not be read from the title.']);
  });
});
