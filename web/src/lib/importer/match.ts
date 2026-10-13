import type { Check, Group, LevelMap, Section, ServiceLevel, Unit } from '../../types';
import type { ParsedDoc, ParsedItem } from './types.ts';

// Compares a parsed document with the master checklist and works out what an
// import would change. Nothing here mutates anything: the plan is shown to the
// user first, who can override single decisions, then apply.ts carries it out.
//
// Matching is deliberately conservative, like the hand-built sheet: a document
// item is the same check only when its wording is identical (ignoring case,
// spacing and dash/quote glyph variants) or was explicitly linked before
// (Check.alias). Near-misses are only ever suggested, never merged silently.

/** The slice of store state the importer reads. */
export interface MasterData {
  checks: Check[];
  sections: Section[];
  units: Unit[];
  levels: LevelMap;
}

export type MatchVia = 'exact' | 'alias' | 'elsewhere';

export interface PlanItem {
  parsed: ParsedItem;
  /** Existing check this item is, or null if it would be created. */
  checkId: number | null;
  /** How the match was made. 'elsewhere' = same wording but filed under a different section. */
  via: MatchVia | null;
  /** True when the check is already ticked for this unit and level. */
  alreadyIn: boolean;
  /** Existing section it belongs in, or null if one would be created. */
  sectionId: number | null;
  /** Closest existing check, offered when nothing matched. */
  suggestion: { checkId: number; score: number } | null;
  /** SL0 only: the matched check's answers differ from the document's. */
  answersDiffer: boolean;
}

export interface ImportPlan {
  doc: ParsedDoc;
  unit: Unit;
  level: ServiceLevel;
  group: Group;
  /** Problems that stop this document being imported at all. */
  blockers: string[];
  createsUnit: boolean;
  createsLevel: boolean;
  items: PlanItem[];
  /** Checks ticked for this unit and level today that the document no longer lists. */
  missingIds: number[];
}

export const SUGGEST_MIN = 0.85;

/** Wording identity: case, whitespace and dash/quote glyph variants don't count. */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Section/WO names compare on letters and digits only ("Common-Pre" = "Common Pre"). */
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** "WO #2: Mechanical" -> "mechanical". */
const bandName = (wo: string) => normName(wo.replace(/^(?:WO|Task Line)\s*#\s*\d+\s*:?/i, ''));

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice on character pairs. A suggestion aid only, never a merge rule. */
function dice(a: Map<string, number>, b: Map<string, number>, la: number, lb: number): number {
  let shared = 0;
  a.forEach((n, g) => {
    shared += Math.min(n, b.get(g) ?? 0);
  });
  return la + lb ? (2 * shared) / (la + lb) : 0;
}

/** Looks up the store's own spelling of a level ("Rigup", "RigDown", "SL3"). */
export function resolveLevel(levels: LevelMap, level: ServiceLevel): ServiceLevel | null {
  const want = normName(level);
  for (const list of Object.values(levels)) {
    const hit = list.find((l) => normName(l) === want);
    if (hit) return hit;
  }
  return null;
}

const sectionMatches = (sec: Section, item: ParsedItem, g: Group) =>
  sec.g === g && normName(sec.name) === normName(item.sectionName) && (!item.band || bandName(sec.wo) === bandName(item.band));

/** The master's own WO label for a document band, e.g. "WO #1: Common Pre" for
 * "Task Line #1: Common-Pre". Falls back to the band as printed. */
export function resolveBand(sections: Section[], g: Group, band: string): string {
  const want = bandName(band);
  return sections.find((s) => s.g === g && bandName(s.wo) === want)?.wo ?? band;
}

export interface PlanOptions {
  /** Only offer close-match suggestions among checks with an id below this.
   * The review screen sets it to the id counter from before the batch, so a
   * suggestion can never point at a check a file earlier in the batch is only
   * going to create (its id would shift if the user changed an earlier choice). */
  suggestBelowId?: number;
}

export function buildPlan(doc: ParsedDoc, data: MasterData, opts: PlanOptions = {}): ImportPlan {
  const blockers: string[] = [];
  if (!doc.unit) blockers.push('The unit could not be read from the title.');
  if (!doc.level) blockers.push('The service level could not be read from the title.');
  if (!doc.items.length) blockers.push('No checks were found.');

  const resolved = doc.level ? resolveLevel(data.levels, doc.level) : null;
  const level = resolved ?? doc.level ?? '';
  const group: Group =
    Object.keys(data.levels).find((g) => data.levels[g].includes(level)) ?? doc.group ?? 'SL0';
  const unit = doc.unit ?? '';

  const inGroup = data.checks.filter((c) => c.g === group);
  const byText = new Map<string, Check[]>();
  const add = (key: string, c: Check) => {
    const list = byText.get(key);
    if (list) list.push(c);
    else byText.set(key, [c]);
  };
  for (const c of inGroup) {
    add(normText(c.n), c);
    for (const a of c.alias ?? []) add(normText(a), c);
  }

  const claimed = new Set<number>();
  const items: PlanItem[] = doc.items.map((parsed) => {
    const section = data.sections.find((s) => sectionMatches(s, parsed, group)) ?? null;
    const text = normText(parsed.text);
    const candidates = (byText.get(text) ?? []).filter((c) => !claimed.has(c.id));

    let hit: Check | undefined = section ? candidates.find((c) => c.s === section.id) : undefined;
    let via: MatchVia | null = null;
    if (hit) via = normText(hit.n) === text ? 'exact' : 'alias';
    else if (!section || !candidates.some((c) => c.s === section.id)) {
      // Same wording filed under another section: only trust it when unambiguous.
      if (candidates.length === 1) {
        hit = candidates[0];
        via = 'elsewhere';
      }
    }
    if (hit) claimed.add(hit.id);

    let suggestion: PlanItem['suggestion'] = null;
    if (!hit) {
      const grams = bigrams(text);
      let best: { checkId: number; score: number } | null = null;
      for (const c of inGroup) {
        if (claimed.has(c.id) || c.id >= (opts.suggestBelowId ?? Infinity)) continue;
        const t = normText(c.n);
        const score = dice(grams, bigrams(t), text.length - 1, t.length - 1);
        if (score >= SUGGEST_MIN && (!best || score > best.score)) best = { checkId: c.id, score };
      }
      suggestion = best;
    }

    return {
      parsed,
      checkId: hit?.id ?? null,
      via,
      alreadyIn: !!hit && hit.rows.some((r) => r.u === unit && r.s === level),
      sectionId: hit ? hit.s : (section?.id ?? null),
      suggestion,
      answersDiffer: !!hit && group === 'SL0' && !sameAnswers(hit, parsed),
    };
  });

  const listed = new Set(items.flatMap((i) => (i.checkId === null ? [] : [i.checkId])));
  const missingIds = inGroup
    .filter((c) => c.rows.some((r) => r.u === unit && r.s === level) && !listed.has(c.id))
    .map((c) => c.id);

  return {
    doc,
    unit,
    level,
    group,
    blockers,
    createsUnit: !!unit && !data.units.includes(unit),
    createsLevel: !!level && !resolved,
    items,
    missingIds,
  };
}

function sameAnswers(c: Check, p: ParsedItem): boolean {
  const key = (o: { t: string; bad: boolean }) => `${o.bad ? 1 : 0}${normText(o.t)}`;
  const a = c.o.map(key).sort().join('|');
  const b = p.options.map(key).sort().join('|');
  return a === b;
}
