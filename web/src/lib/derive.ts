import { SUGGEST_THRESHOLD } from './constants';
import type {
  Check,
  Group,
  LevelMap,
  Section,
  ServiceLevel,
  Unit,
  UnitMatchMode,
} from '../types';

/** Look up a check by its stable id — never by array position. Checks can be
 * removed (cascade-delete on section removal), which shifts array indices but
 * never reuses or renumbers an existing `.id`, so this is the only safe way
 * to resolve one. */
export function getCheck(checks: Check[], id: number): Check | undefined {
  return checks.find((c) => c.id === id);
}

/** Same as getCheck, for sections. */
export function getSection(sections: Section[], id: number): Section | undefined {
  return sections.find((s) => s.id === id);
}

/** The matrix's filter/view state — everything `derive` functions need to know
 * which checks and columns are currently in view. Mirrors the module-scope
 * globals (`mg, q, fsec, fu, fs, mode, onlyCols`) from the original demo.
 * `units` is the live, store-owned unit list (user-extensible via addUnit). */
export interface MatrixFilters {
  mg: Group;
  q: string;
  fsec: number | '';
  fu: Unit[];
  fs: ServiceLevel[];
  mode: UnitMatchMode;
  onlyCols: boolean;
  units: Unit[];
  /** Live level map from the store (user-extensible via addLevel). */
  levelMap: LevelMap;
  /** Units added in the app (not seeded). Selecting one in 'any' mode lists
   * every check, ticked or not, so the user can pick which belong to it —
   * and the list doesn't collapse as soon as the first box is ticked. */
  addedUnits: Unit[];
}

/** Smart suggestion for a new unit: every (check, service level) pair that at
 * least SUGGEST_THRESHOLD of the existing units already have ticked. */
export function suggestDocs(checks: Check[], units: Unit[]): { checkId: number; s: ServiceLevel }[] {
  if (!units.length) return [];
  const out: { checkId: number; s: ServiceLevel }[] = [];
  checks.forEach((c) => {
    const perLevel = new Map<ServiceLevel, Set<Unit>>();
    c.rows.forEach((r) => {
      if (!units.includes(r.u)) return;
      if (!perLevel.has(r.s)) perLevel.set(r.s, new Set());
      perLevel.get(r.s)!.add(r.u);
    });
    perLevel.forEach((us, s) => {
      if (us.size / units.length >= SUGGEST_THRESHOLD) out.push({ checkId: c.id, s });
    });
  });
  return out;
}

/** Which service levels are in scope: the selected chips, or the whole current group. */
export function levels(filters: Pick<MatrixFilters, 'fs' | 'mg' | 'levelMap'>): ServiceLevel[] {
  return filters.fs.length ? filters.fs : filters.levelMap[filters.mg];
}

/** Does check `c` appear in unit `u` at one of the in-scope service levels? */
export function has(c: Check, u: Unit, filters: Pick<MatrixFilters, 'fs' | 'mg' | 'levelMap'>): boolean {
  const L = levels(filters);
  return c.rows.some((r) => r.u === u && L.includes(r.s));
}

export function baseMatch(c: Check, g: Group, filters: MatrixFilters): boolean {
  const ql = filters.q.toLowerCase();
  return (
    c.g === g &&
    (!ql || c.n.toLowerCase().includes(ql)) &&
    (g !== filters.mg || filters.fsec === '' || c.s === filters.fsec) 
  );
}

/** Same as baseMatch but without the group check — for PDF export, where the
 * caller has already filtered the list down to one group. */
export function baseMatchNoGroup(c: Check, g: Group, filters: MatrixFilters): boolean {
  const ql = filters.q.toLowerCase();
  return (
    (!ql || c.n.toLowerCase().includes(ql)) &&
    (g !== filters.mg || filters.fsec === '' || c.s === filters.fsec) 
  );
}

export function unitMatch(c: Check, filters: MatrixFilters): boolean {
  const { fu, mode, units } = filters;
  const others = units.filter((u) => !fu.includes(u));
  if (!fu.length) return units.some((u) => has(c, u, filters));
  if (mode === 'any') return fu.some((u) => filters.addedUnits.includes(u) || has(c, u, filters));
  if (mode === 'all') return fu.every((u) => has(c, u, filters));
  if (mode === 'only') return fu.every((u) => has(c, u, filters)) && others.every((u) => !has(c, u, filters));
  return fu.every((u) => !has(c, u, filters)) && others.some((u) => has(c, u, filters));
}

export interface SummaryResult {
  /** Whether the count should render bold (matches the original's `<b>n</b>`). */
  bold: boolean;
  /** Text following the count, e.g. " checks in CPF-577". */
  suffix: string;
}

export function summary(filters: MatrixFilters): SummaryResult {
  const { fu, fs, mode } = filters;
  if (!fu.length && !fs.length) return { bold: false, suffix: ' checks' };
  const names = fu.map((u) => 'CPF-' + u);
  const lv = fs.length ? ' at ' + fs.join(', ') : '';
  const join = (a: string[]) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a.at(-1) : a[0]);
  if (!fu.length) return { bold: true, suffix: ` checks used by any unit${lv}` };
  const modeText: Record<UnitMatchMode, string> = {
    any: 'in ' + join(names).replace(' and ', ' or '),
    all: (fu.length > 1 ? 'shared by ' : 'in ') + join(names),
    only: 'used only by ' + join(names),
    missing: 'used elsewhere but missing from ' + join(names),
  };
  return { bold: true, suffix: ` checks ${modeText[mode]}${lv}` };
}

/** Which unit/service-level columns to show, given the "show selected columns
 * only" toggle and the current filter chips. */
export function cols(filters: MatrixFilters): { us: Unit[]; ss: ServiceLevel[] } {
  const { onlyCols, fu, mode, fs, mg, units, levelMap } = filters;
  return {
    us: onlyCols && fu.length && mode !== 'missing' ? units.filter((u) => fu.includes(u)) : units,
    ss: onlyCols && fs.length ? levelMap[mg].filter((s) => fs.includes(s)) : levelMap[mg],
  };
}
