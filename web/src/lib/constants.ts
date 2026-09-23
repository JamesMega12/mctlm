import type { Group, ServiceLevel, Unit } from '../types';

// Seed list only — the live, user-extensible unit list is store.units. Kept
// here just to initialize the store; don't import this for rendering.
export const DEFAULT_UNITS: Unit[] = ['376/377', '577', '573', '870'];

export const GROUPS: Record<Group, ServiceLevel[]> = {
  SL0: ['Outgoing', 'Rigup', 'RigDown', 'Incoming'],
  'SL1/3/4': ['SL1', 'SL3', 'SL4'],
};

export const SLS: ServiceLevel[] = [...GROUPS.SL0, ...GROUPS['SL1/3/4']];

export const SLNAME = (s: ServiceLevel): string =>
  (GROUPS.SL0 as string[]).includes(s) ? 'SL0 ' + s : s;

/** Which group a service level belongs to. */
export const GOF = (s: ServiceLevel): Group =>
  (GROUPS.SL0 as string[]).includes(s) ? 'SL0' : 'SL1/3/4';

export const MODES: Record<'any' | 'all' | 'only' | 'missing', string> = {
  any: 'In any selected unit',
  all: 'Shared by all selected',
  only: 'Only in selected units',
  missing: 'Missing from selected',
};

export const TODAY = '2026-09-17';
export const ME = 'You (TLM)';

/**
 * Deterministic RNG (same LCG + seed as the original demo) so the simulated
 * drift/pending sync statuses are reproducible across reloads.
 */
export function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
