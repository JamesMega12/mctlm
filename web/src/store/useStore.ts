import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { DEFAULT_LEVELS, DEFAULT_UNITS, ME, SLNAME, TODAY } from '../lib/constants';
import { getCheck, getSection, suggestDocs } from '../lib/derive';
import { buildInitialState } from '../lib/init';
import { RAW } from '../data/checklist-data';
import type {
  Check,
  Group,
  LevelMap,
  Option,
  Section,
  ServiceLevel,
  Unit,
  UnitMatchMode,
  View,
} from '../types';

export interface DupWarnPayload {
  sectionId: number;
  pending: { n: string; boxes: { u: Unit; s: ServiceLevel }[]; o: Option[]; swi: boolean };
  matchCheckId: number;
  matchScore: number;
  exact: boolean;
}

export type ModalState =
  | { kind: 'addCheck'; sectionId: number }
  | { kind: 'dupWarn'; payload: DupWarnPayload }
  | { kind: 'export' }
  | { kind: 'addSection'; g: Group }
  | { kind: 'addUnit' }
  | null;

interface StoreState {
  // --- data ---
  checks: Check[];
  sections: Section[];
  units: Unit[];
  addedUnits: Unit[]; // units created in the app, not seeded — see MatrixFilters.addedUnits
  levels: LevelMap;
  // Monotonic id counters — never reused, even across deletions, so a
  // check/section's `.id` always uniquely and stably identifies it. See
  // lib/derive.ts's getCheck/getSection.
  nextCheckId: number;
  nextSectionId: number;

  // --- navigation ---
  view: View;

  // --- matrix filters ---
  mg: Group;
  q: string;
  fsec: number | '';
  fu: Unit[];
  fs: ServiceLevel[];
  mode: UnitMatchMode;
  onlyCols: boolean;
  openRow: number | null;

  // --- drawer (check and section drawers share one DOM slot — only one of
  // drawerId / sectionDrawerId is ever non-null at a time) ---
  drawerId: number | null;
  editing: boolean;
  sectionDrawerId: number | null;

  // --- modal ---
  modal: ModalState;

  // --- export dialog (persists across opens once first seeded) ---
  expU: Unit[] | null;
  expL: ServiceLevel[] | null;
  expGrp: 'unit' | 'level';
  expAns: boolean;

  // --- toast ---
  toastText: string | null;

  // --- actions ---
  setView: (v: View) => void;
  setGroup: (g: Group) => void;
  setSearch: (q: string) => void;
  setSectionFilter: (fsec: number | '') => void;
  toggleUnitFilter: (u: Unit) => void;
  toggleLevelFilter: (s: ServiceLevel) => void;
  setUnitMode: (mode: UnitMatchMode) => void;
  setOnlyCols: (v: boolean) => void;
  clearMatrixFilters: () => void;
  colFilter: (u: Unit, s?: ServiceLevel) => void;
  toggleOpenRow: (id: number) => void;

  openDrawer: (id: number, edit?: boolean) => void;
  closeDrawer: () => void;
  setEditing: (v: boolean) => void;
  saveEdit: (id: number, form: { n: string; c: string; swi: boolean; o: Option[] }) => void;
  toggleUse: (id: number, u: Unit, s: ServiceLevel) => void;

  openSectionDrawer: (id: number) => void;
  closeSectionDrawer: () => void;
  /** Assumes the caller already validated name/wo (non-empty) — see
   * AddSectionDialog. Returns the new section's id so the caller can open its
   * drawer or the add-check dialog right after. */
  addSection: (g: Group, name: string, wo: string) => number;
  updateSection: (id: number, patch: { name?: string; wo?: string }) => void;
  removeSection: (id: number) => void;
  /** Deletes one check and closes its drawer. The caller confirms first (see Drawer.tsx). */
  removeCheck: (id: number) => void;

  /** Assumes the caller already validated the name (non-empty, not a
   * duplicate) — see AddUnitDialog / AddView. */
  addUnit: (name: string, prefill?: boolean) => void;

  /** Assumes the caller already validated the name (non-empty, not a
   * duplicate across all groups) — see AddView. If `g` isn't an existing
   * group it's created, as a new matrix tab. New levels start empty:
   * a new column for every unit, no checks ticked. */
  addLevel: (g: Group, name: string) => void;

  openAddCheckDialog: (sectionId: number) => void;
  openDupWarnDialog: (payload: DupWarnPayload) => void;
  backToAddForm: (sectionId: number) => void;
  openAddSectionDialog: (g: Group) => void;
  openAddUnitDialog: () => void;
  closeModal: () => void;
  commitNew: (secId: number, n: string, boxes: { u: Unit; s: ServiceLevel }[], o: Option[], swi: boolean) => void;

  openExportDialog: () => void;
  toggleExportUnit: (u: Unit) => void;
  toggleExportLevel: (s: ServiceLevel) => void;
  setExportGroupOrder: (v: 'unit' | 'level') => void;
  setExportIncludeAnswers: (v: boolean) => void;

  pushToast: (text: string) => void;
}

const initial = buildInitialState(RAW);

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<StoreState>()(
  immer((set, get) => ({
    checks: initial.checks,
    sections: initial.sections,
    units: [...DEFAULT_UNITS],
    addedUnits: [],
    levels: { SL0: [...DEFAULT_LEVELS.SL0], 'SL1/3/4': [...DEFAULT_LEVELS['SL1/3/4']] },
    nextCheckId: initial.checks.length,
    nextSectionId: initial.sections.length,

    view: 'dash',

    mg: 'SL0',
    q: '',
    fsec: '',
    fu: [],
    fs: [],
    mode: 'any',
    onlyCols: true,
    openRow: null,

    drawerId: null,
    editing: false,
    sectionDrawerId: null,

    modal: null,

    expU: null,
    expL: null,
    expGrp: 'unit',
    expAns: true,

    toastText: null,

    setView: (v) => set((state) => void (state.view = v)),

    setGroup: (g) =>
      set((state) => {
        state.mg = g;
        state.fsec = '';
        state.openRow = null;
        state.fs = state.fs.filter((s) => state.levels[g].includes(s));
      }),

    setSearch: (q) => set((state) => void (state.q = q)),
    setSectionFilter: (fsec) => set((state) => void (state.fsec = fsec)),

    toggleUnitFilter: (u) =>
      set((state) => {
        const i = state.fu.indexOf(u);
        if (i < 0) state.fu.push(u);
        else state.fu.splice(i, 1);
      }),

    toggleLevelFilter: (s) =>
      set((state) => {
        const i = state.fs.indexOf(s);
        if (i < 0) state.fs.push(s);
        else state.fs.splice(i, 1);
      }),

    setUnitMode: (mode) => set((state) => void (state.mode = mode)),
    setOnlyCols: (v) => set((state) => void (state.onlyCols = v)),

    clearMatrixFilters: () =>
      set((state) => {
        state.fu = [];
        state.fs = [];
        state.mode = 'any';
      }),

    colFilter: (u, s) =>
      set((state) => {
        state.fu = [u];
        state.mode = 'any';
        state.onlyCols = true;
        state.fs = s ? [s] : [];
      }),

    toggleOpenRow: (id) =>
      set((state) => {
        state.openRow = state.openRow === id ? null : id;
      }),

    openDrawer: (id, edit = false) =>
      set((state) => {
        state.drawerId = id;
        state.editing = edit;
        state.sectionDrawerId = null;
      }),

    closeDrawer: () =>
      set((state) => {
        state.drawerId = null;
        state.editing = false;
      }),

    setEditing: (v) => set((state) => void (state.editing = v)),

    saveEdit: (id, form) => {
      let toastText = '';
      set((state) => {
        const c = getCheck(state.checks, id)!;
        const changes: string[] = [];
        if (form.n !== c.n) {
          changes.push('wording');
          c.n = form.n;
        }
        if (form.c !== (c.c || '')) {
          changes.push('comments');
          c.c = form.c;
        }
        if (form.swi !== c.swi) {
          changes.push('SWI flag');
          c.swi = form.swi;
        }
        const currentOpts = c.o.map((o) => ({ t: o.t, bad: o.bad }));
        if (JSON.stringify(form.o) !== JSON.stringify(currentOpts)) {
          changes.push('answers');
          c.o = form.o;
        }
        if (!changes.length) {
          state.editing = false;
          toastText = 'No changes to save.';
          return;
        }
        c.history.push({ t: TODAY, who: ME, what: 'Edited ' + changes.join(', ') });
        state.editing = false;
        toastText = 'Saved.';
      });
      get().pushToast(toastText);
    },

    toggleUse: (id, u, s) => {
      let toastText = '';
      set((state) => {
        const c = getCheck(state.checks, id)!;
        const i = c.rows.findIndex((r) => r.u === u && r.s === s);
        if (i < 0) {
          c.rows.push({ u, s });
          c.history.push({ t: TODAY, who: ME, what: `Added to CPF-${u} ${SLNAME(s, state.levels)}` });
          toastText = `Added to CPF-${u} ${SLNAME(s, state.levels)}.`;
        } else {
          if (c.rows.length === 1) {
            toastText = 'A check must stay in at least one document. Delete the check instead (double-click it, then Delete check).';
            return;
          }
          c.rows.splice(i, 1);
          c.history.push({ t: TODAY, who: ME, what: `Removed from CPF-${u} ${SLNAME(s, state.levels)}` });
          toastText = `Removed from CPF-${u} ${SLNAME(s, state.levels)}.`;
        }
      });
      get().pushToast(toastText);
    },

    openSectionDrawer: (id) =>
      set((state) => {
        state.sectionDrawerId = id;
        state.drawerId = null;
        state.editing = false;
      }),

    closeSectionDrawer: () => set((state) => void (state.sectionDrawerId = null)),

    addSection: (g, name, wo) => {
      let newId = 0;
      set((state) => {
        newId = state.nextSectionId++;
        state.sections.push({ id: newId, name, wo: g === 'SL0' ? 'SL0' : wo, g });
      });
      return newId;
    },

    updateSection: (id, patch) =>
      set((state) => {
        const s = getSection(state.sections, id)!;
        if (patch.name !== undefined) s.name = patch.name;
        if (patch.wo !== undefined && s.wo !== 'SL0') s.wo = patch.wo;
      }),

    removeCheck: (id) => {
      set((state) => {
        state.checks = state.checks.filter((c) => c.id !== id);
        state.drawerId = null;
        state.editing = false;
        state.openRow = null;
      });
      get().pushToast('Check deleted.');
    },

    removeSection: (id) => {
      let removedCount = 0;
      set((state) => {
        const removedIds = new Set(state.checks.filter((c) => c.s === id).map((c) => c.id));
        removedCount = removedIds.size;
        state.checks = state.checks.filter((c) => !removedIds.has(c.id));
        state.sections = state.sections.filter((s) => s.id !== id);
        if (state.drawerId !== null && removedIds.has(state.drawerId)) {
          state.drawerId = null;
          state.editing = false;
        }
        state.sectionDrawerId = null;
        state.openRow = null;
      });
      get().pushToast(`Removed section and ${removedCount} check${removedCount !== 1 ? 's' : ''}.`);
    },

    addUnit: (name, prefill = false) => {
      let n = 0;
      set((state) => {
        if (prefill) {
          // Computed against the units that existed before this one.
          suggestDocs(state.checks, state.units).forEach(({ checkId, s }) => {
            const c = getCheck(state.checks, checkId)!;
            c.rows.push({ u: name, s });
            c.history.push({ t: TODAY, who: ME, what: `Pre-filled into CPF-${name} ${SLNAME(s, state.levels)} (smart suggestion)` });
            n++;
          });
        }
        state.units.push(name);
        state.addedUnits.push(name);
      });
      get().pushToast(
        prefill
          ? `CPF-${name} added with ${n} suggested document row${n !== 1 ? 's' : ''}. Untick any that don't apply.`
          : `CPF-${name} added. Tick its checks in the matrix to build it up.`,
      );
    },

    addLevel: (g, name) => {
      const isNewGroup = !(g in get().levels);
      set((state) => {
        (state.levels[g] ??= []).push(name);
      });
      get().pushToast(
        isNewGroup
          ? `${name} added as a new group with its first service level. Add a section to it from the matrix.`
          : `${SLNAME(name, get().levels)} added. Tick checks into it from the matrix.`,
      );
    },

    openAddCheckDialog: (sectionId) => set((state) => void (state.modal = { kind: 'addCheck', sectionId })),
    openDupWarnDialog: (payload) => set((state) => void (state.modal = { kind: 'dupWarn', payload })),
    backToAddForm: (sectionId) => set((state) => void (state.modal = { kind: 'addCheck', sectionId })),
    openAddSectionDialog: (g) => set((state) => void (state.modal = { kind: 'addSection', g })),
    openAddUnitDialog: () => set((state) => void (state.modal = { kind: 'addUnit' })),
    closeModal: () => set((state) => void (state.modal = null)),

    commitNew: (secId, n, boxes, o, swi) => {
      let newId = 0;
      set((state) => {
        const g: Group = getSection(state.sections, secId)!.g;
        newId = state.nextCheckId++;
        state.checks.push({
          id: newId,
          s: secId,
          n,
          o,
          swi,
          c: '',
          g,
          rows: boxes.map((b) => ({ u: b.u, s: b.s })),
          history: [{ t: TODAY, who: ME, what: `Created in ${boxes.length} document${boxes.length > 1 ? 's' : ''}` }],
        });
        state.modal = null;
        state.mg = g;
        state.fsec = '';
        state.drawerId = newId;
        state.editing = false;
      });
      get().pushToast(`Added to ${boxes.length} document${boxes.length > 1 ? 's' : ''}.`);
    },

    openExportDialog: () =>
      set((state) => {
        if (!state.expU) state.expU = state.fu.length ? [...state.fu] : [...state.units];
        if (!state.expL) state.expL = state.fs.length ? [...state.fs] : [...state.levels[state.mg]];
        state.modal = { kind: 'export' };
      }),

    toggleExportUnit: (u) =>
      set((state) => {
        if (!state.expU) return;
        const i = state.expU.indexOf(u);
        if (i < 0) state.expU.push(u);
        else state.expU.splice(i, 1);
      }),

    toggleExportLevel: (s) =>
      set((state) => {
        if (!state.expL) return;
        const i = state.expL.indexOf(s);
        if (i < 0) state.expL.push(s);
        else state.expL.splice(i, 1);
      }),

    setExportGroupOrder: (v) => set((state) => void (state.expGrp = v)),
    setExportIncludeAnswers: (v) => set((state) => void (state.expAns = v)),

    pushToast: (text) => {
      set((state) => void (state.toastText = text));
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        set((state) => void (state.toastText = null));
      }, 2800);
    },
  })),
);
