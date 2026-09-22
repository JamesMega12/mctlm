import { makeRng, SLNAME } from './constants';
import type { Check, Mismatch, RawData, Section, SyncStatus } from '../types';

/**
 * Expands the raw extracted data into the app's working shape, and seeds the
 * same simulated sync statuses the original demo used — a fixed-seed RNG (7)
 * walks every check and flags ~2.5% as drift and ~1.5% as pending, so the
 * review queue has something in it on first load. Real statuses come from the
 * weekly WorkRight scrape; see ARCHITECTURE_3.md.
 */
export function buildInitialState(raw: RawData): {
  checks: Check[];
  sections: Section[];
  mismatches: Mismatch[];
} {
  const rnd = makeRng(7);

  const checks: Check[] = raw.checks.map((rc, i) => ({
    id: i,
    wr: 'RC-' + (40210 + i * 7),
    s: rc.s,
    n: rc.n,
    o: rc.o.map(([t, bad]) => ({ t, bad: !!bad })),
    swi: !!rc.swi,
    c: rc.c,
    g: rc.g,
    rows: rc.d.map(([u, s]) => ({ u, s, st: 'synced' as SyncStatus })),
    history: [{ t: '2026-06-02', who: 'Initial seed', what: 'Imported from WorkRight' }],
  }));

  const mismatches: Mismatch[] = [];
  checks.forEach((c) => {
    const r = rnd();
    if (r < 0.025) {
      const row = c.rows[Math.floor(rnd() * c.rows.length)];
      row.st = 'drift';
      const opt = c.o.length && rnd() < 0.6 ? Math.floor(rnd() * c.o.length) : null;
      mismatches.push({
        id: mismatches.length,
        check: c.id,
        u: row.u,
        s: row.s,
        type: opt !== null ? 'Answer wording changed' : 'Missing from WorkRight checklist',
        opt,
        app: opt !== null ? c.o[opt].t : 'Present in CPF-' + row.u + ' ' + SLNAME(row.s),
        wr: opt !== null ? c.o[opt].t.replace(/damage/i, 'damages') + ' (edited)' : 'Not found in last scrape',
        done: null,
      });
    } else if (r < 0.04) {
      const row = c.rows[Math.floor(rnd() * c.rows.length)];
      row.st = 'pending';
      c.history.push({ t: '2026-09-11', who: 'A. Tan (TLM)', what: 'Added to CPF-' + row.u + ' ' + SLNAME(row.s) });
    }
  });

  return { checks, sections: raw.sections, mismatches };
}
