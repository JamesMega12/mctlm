import type { Check, Group, LevelMap, Section, Unit } from '../../types';
import { normText, resolveBand, type ImportPlan } from './match.ts';

/** What the user chose for one document item, overriding the plan's default
 * (match if matched, create if not). */
export type ItemDecision = 'new' | 'skip' | { link: number };

export interface ApplyOptions {
  /** Per item index, from ImportPlan.items. */
  decisions: Record<number, ItemDecision>;
  /** Untick checks that are ticked for this document today but no longer in it. */
  untickMissing: boolean;
  /** Date and author stamped on the history entries. */
  when: string;
  who: string;
}

export interface ApplyResult {
  ticked: number;
  created: number;
  unticked: number;
  sectionsCreated: number;
  linked: number;
  skipped: number;
}

/** The part of the store an import mutates. Works on a plain object or an immer draft. */
export interface MasterDraft {
  checks: Check[];
  sections: Section[];
  units: Unit[];
  addedUnits: Unit[];
  levels: LevelMap;
  nextCheckId: number;
  nextSectionId: number;
}

/** Carries out a plan against `data`, in place. */
export function applyPlan(data: MasterDraft, plan: ImportPlan, opts: ApplyOptions): ApplyResult {
  const { unit, level, group } = plan;
  const file = plan.doc.fileName;
  const source = plan.doc.version ? `${file} (${plan.doc.version})` : file;
  const result: ApplyResult = { ticked: 0, created: 0, unticked: 0, sectionsCreated: 0, linked: 0, skipped: 0 };

  if (!data.units.includes(unit)) {
    data.units.push(unit);
    data.addedUnits.push(unit);
  }
  if (!data.levels[group]) data.levels[group] = [];
  if (!data.levels[group].includes(level)) data.levels[group].push(level);

  const byId = new Map<number, Check>(data.checks.map((c) => [c.id, c]));
  const touched = new Set<number>();
  const newSections = new Map<string, number>();

  const sectionFor = (idx: number): number => {
    const item = plan.items[idx];
    if (item.sectionId !== null) return item.sectionId;
    const p = item.parsed;
    const wo = p.band ? resolveBand(data.sections, group, p.band) : 'SL0';
    const key = `${wo}\u0000${normText(p.sectionName)}`;
    const known = newSections.get(key);
    if (known !== undefined) return known;
    const id = data.nextSectionId++;
    data.sections.push({ id, name: p.sectionName, wo, g: group as Group });
    newSections.set(key, id);
    result.sectionsCreated++;
    return id;
  };

  const tick = (c: Check, note: string) => {
    if (c.rows.some((r) => r.u === unit && r.s === level)) return;
    c.rows.push({ u: unit, s: level });
    c.history.push({ t: opts.when, who: opts.who, what: note });
    result.ticked++;
  };

  plan.items.forEach((item, idx) => {
    const decision = opts.decisions[idx];
    if (decision === 'skip') {
      result.skipped++;
      return;
    }

    let target: Check | undefined;
    if (decision && typeof decision === 'object') {
      target = byId.get(decision.link);
      if (target && normText(target.n) !== normText(item.parsed.text)) {
        target.alias = [...(target.alias ?? []), item.parsed.text];
        result.linked++;
      }
    } else if (decision !== 'new' && item.checkId !== null) {
      target = byId.get(item.checkId);
    }

    if (target) {
      touched.add(target.id);
      tick(target, `Ticked for ${unit} ${level} from ${source}`);
      return;
    }

    const c: Check = {
      id: data.nextCheckId++,
      s: sectionFor(idx),
      n: item.parsed.text,
      o: item.parsed.options.map((o) => ({ ...o })),
      swi: false,
      c: '',
      g: group,
      rows: [{ u: unit, s: level }],
      history: [{ t: opts.when, who: opts.who, what: `Added from ${source}` }],
    };
    data.checks.push(c);
    byId.set(c.id, c);
    touched.add(c.id);
    result.created++;
  });

  if (opts.untickMissing) {
    for (const c of data.checks) {
      if (c.g !== group || touched.has(c.id)) continue;
      const i = c.rows.findIndex((r) => r.u === unit && r.s === level);
      if (i < 0) continue;
      c.rows.splice(i, 1);
      c.history.push({ t: opts.when, who: opts.who, what: `Unticked for ${unit} ${level}: not in ${source}` });
      result.unticked++;
    }
  }
  return result;
}
