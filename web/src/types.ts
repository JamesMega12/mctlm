// Domain types for the CPF Master Checklist.
//
// Vocabulary (see CLAUDE_3.md):
//   Check    — one maintenance task (604 of them).
//   Unit     — a cement pump truck: CPF-376/377, CPF-577, CPF-573, CPF-870.
//   Service level — when a check runs: SL0 splits into Outgoing/Rigup/RigDown/Incoming,
//                   then SL1, SL3, SL4.
//   Document — one unit at one service level (4 x 7 = 28 documents). Modelled as one
//              entry in a check's `rows`.
//   Answer   — a possible response to an SL0 check: good or defect (`bad`).

// A plain string, not a fixed union — groups are user-extensible (see addLevel in
// the store). Seeded: 'SL0' and 'SL1/3/4'. A group is one matrix tab.
export type Group = string;

// A plain string, not a fixed union — service levels are user-extensible (see
// addLevel in the store). The seed names are Outgoing/Rigup/RigDown/Incoming
// (group SL0) and SL1/SL3/SL4 (group SL1/3/4).
export type ServiceLevel = string;

/** Service levels per group, in tab order. Groups and levels both grow. */
export type LevelMap = Record<Group, ServiceLevel[]>;

// A plain string, not a fixed union — units are user-extensible (see addUnit in
// the store), so "376/377" and any later-added unit name are equally valid.
export type Unit = string;

/** Unit match mode for the matrix filter chips. */
export type UnitMatchMode = 'any' | 'all' | 'only' | 'missing';

export type View = 'dash' | 'matrix' | 'add';

/** Raw shape as produced by tools/extract.py and embedded in the old demo. */
export interface RawCheck {
  s: number; // section id
  n: string; // wording
  o: [string, 0 | 1][]; // answer options
  swi: 0 | 1;
  c: string; // comments
  d: [Unit, ServiceLevel][]; // documents this check appears in
  g: Group;
}

export interface RawSection {
  id: number;
  name: string;
  wo: string;
}

export interface RawData {
  checks: RawCheck[];
  sections: RawSection[];
}

// --- App-domain shapes (post-expansion, what the store holds) ---

export interface Option {
  t: string;
  bad: boolean;
}

export interface DocRow {
  u: Unit;
  s: ServiceLevel;
}

export interface HistoryEntry {
  t: string; // date, YYYY-MM-DD
  who: string;
  what: string;
}

export interface Check {
  id: number;
  s: number; // section id
  n: string; // wording
  o: Option[];
  swi: boolean;
  c: string; // comments
  g: Group;
  rows: DocRow[];
  history: HistoryEntry[];
}

export interface Section {
  id: number;
  name: string;
  wo: string;
  g: Group; // which group (matrix tab) the section belongs to
}
