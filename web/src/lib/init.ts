import type { Check, RawData, Section } from '../types';

/** Expands the raw extracted data into the app's working shape. */
export function buildInitialState(raw: RawData): { checks: Check[]; sections: Section[] } {
  const sections: Section[] = raw.sections.map((rs) => ({ ...rs, g: rs.wo === 'SL0' ? 'SL0' : 'SL1/3/4' }));
  const checks: Check[] = raw.checks.map((rc, i) => ({
    id: i,
    s: rc.s,
    n: rc.n,
    o: rc.o.map(([t, bad]) => ({ t, bad: !!bad })),
    swi: !!rc.swi,
    c: rc.c,
    g: rc.g,
    rows: rc.d.map(([u, s]) => ({ u, s })),
    history: [{ t: '2026-06-02', who: 'Initial seed', what: 'Imported from InTouch ACP rev 18' }],
  }));

  return { checks, sections };
}
