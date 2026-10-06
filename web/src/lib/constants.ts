import type { Group, LevelMap, ServiceLevel, Unit } from '../types';

// Seed list only — the live, user-extensible unit list is store.units. Kept
// here just to initialize the store; don't import this for rendering.
export const DEFAULT_UNITS: Unit[] = ['376/377', '577', '573', '870'];

// Seed list only — the live, user-extensible level map is store.levels. Kept
// here just to initialize the store; don't import this for rendering.
export const DEFAULT_LEVELS: LevelMap = {
  SL0: ['Outgoing', 'Rigup', 'RigDown', 'Incoming'],
  'SL1/3/4': ['SL1', 'SL3', 'SL4'],
};

/** Display name of a level: SL0 levels read "SL0 Rigup", the others as-is. */
export const SLNAME = (s: ServiceLevel, levels: LevelMap): string =>
  levels.SL0.includes(s) ? 'SL0 ' + s : s;

/** Which group a service level belongs to. */
export const GOF = (s: ServiceLevel, levels: LevelMap): Group =>
  Object.keys(levels).find((g) => levels[g].includes(s)) ?? 'SL0';

/** Every level, in group order. */
export const allLevels = (levels: LevelMap): ServiceLevel[] => Object.values(levels).flat();

/** Tab / heading label for a group. User-added groups use their own name. */
export const groupLabel = (g: Group): string =>
  g === 'SL0' ? 'SL0 checks' : g === 'SL1/3/4' ? 'SL1, 3 & 4 tasks' : g;

export const MODES: Record<'any' | 'all' | 'only' | 'missing', string> = {
  any: 'In any selected unit',
  all: 'Shared by all selected',
  only: 'Only in selected units',
  missing: 'Missing from selected',
};

/** Smart suggestion: a check is pre-ticked in a new unit's document when at
 * least this share of the existing units already have it there. */
export const SUGGEST_THRESHOLD = 0.8;

export const TODAY = '2026-09-17';
export const ME = 'You (TLM)';
