import type { Check } from '../../types';
import type { ItemDecision } from './apply.ts';
import type { ImportPlan } from './match.ts';

export interface DocTally {
  /** Already in the master and already ticked: nothing to do. */
  unchanged: number;
  /** In the master, not yet ticked for this document. */
  tick: number;
  add: number;
  link: number;
  skip: number;
  /** Ticked today but not in the document, after links are taken into account. */
  missing: number[];
}

/** What importing `plan` would do once the user's per-item choices are applied.
 * The same counts the review screen shows. */
export function tallyPlan(plan: ImportPlan, decisions: Record<number, ItemDecision>, checks: Check[]): DocTally {
  const t: DocTally = { unchanged: 0, tick: 0, add: 0, link: 0, skip: 0, missing: [] };
  const linked = new Set<number>();
  plan.items.forEach((it, i) => {
    const d = decisions[i];
    if (d === 'skip') t.skip++;
    else if (typeof d === 'object') {
      t.link++;
      linked.add(d.link);
      const target = checks.find((c) => c.id === d.link);
      if (target?.rows.some((r) => r.u === plan.unit && r.s === plan.level)) t.unchanged++;
      else t.tick++;
    } else if (d === 'new' || it.checkId === null) t.add++;
    else if (it.alreadyIn) t.unchanged++;
    else t.tick++;
  });
  t.missing = plan.missingIds.filter((id) => !linked.has(id));
  return t;
}
