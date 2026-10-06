# CLAUDE.md

Working notes for Claude Code on this repo. Read this before changing anything.

## What this is

A working demo of a master checklist database for TLM (Technology Lifecycle
Management). It replaces an Excel sheet that tracks which maintenance checks
belong to which CPF unit at which service level.

It is a **demo, not the product**. All state is in memory and resets on
refresh. There is no backend, no database, no scraper yet. See HANDOVER.md for
where the real build starts.

The app lives entirely in `web/`. An earlier vanilla-JS build (`app/`) was
kept around as a reference while `web/` reached feature parity; it has since
been removed now that `web/` is strictly more complete (matrix cells are
directly tickable, sections have their own management flow, units are
user-extensible). Don't recreate it.

## Domain vocabulary — use these words in code and UI

| Term | Meaning |
|---|---|
| **Check** | One maintenance task. 604 of them. Called a "component" in WorkRight. |
| **Unit** | A cement pump truck: CPF-376/377, CPF-577, CPF-573, CPF-870. **376/377 is ONE unit**, not two. Units are user-extensible in the app now — treat the seed list as a default, not a hard limit. |
| **Service level** | When a check runs. SL0 splits into four: Outgoing, Rigup, RigDown, Incoming. Then SL1 (250h), SL3 (500h), SL4 (annual). Seven in total. |
| **Document** | One unit at one service level. 4 seed units x 7 levels = **28 documents**, but this scales with however many units exist. This is the unit of work everywhere — a PDF page, a matrix cell, a row in a check's `rows`. |
| **Answer** | A possible response to an SL0 check. Either **good** or **defect**. |
| **WorkRight** | The SLB system the checks were originally seeded from. **No longer linked** — see below. |
| **InTouch / ACP** | The source documents the current Excel was built from. |

Never write "CPF-376" and "CPF-377" as separate units. Never treat SL0 as a
single level — it is four documents.

## The rule that drives the design

**The app is no longer linked to WorkRight.** The data was seeded once from the
rev 18 export and the app is now the only source of truth. There is no sync
status (synced / pending / drift), no review queue, no scrape, no WorkRight
id on checks, and no write-back. Don't reintroduce them without asking.

- Individual checks can be deleted: double-click a check, then "Delete check"
  (two-click confirm in `Drawer.tsx`, `removeCheck` in the store). Sections can
  also be removed, cascading to their checks — see `SectionDrawer.tsx`.

## Stack and conventions

React 19 + TypeScript + Vite, state in Zustand with the immer middleware. One
flat store (`web/src/store/useStore.ts`), no router, no backend, no network
calls — this still has to run as a local demo, just no longer without a build
step.

- All state lives in `useStore.ts`. Components read it with selectors
  (`useStore(s => s.checks)`) and call actions on it directly — there is no
  separate reducer/action-creator layer.
- Ids are monotonic counters (`nextCheckId`, `nextSectionId`) that are never
  reused, even across deletions. Always look up checks/sections by id via
  `getCheck` / `getSection` in `lib/derive.ts` — never by array position. A
  past bug came from doing exactly that; don't reintroduce it.
- `lib/derive.ts` holds pure, store-free selectors (filtering, status
  rollup, the four unit-match modes, the summary sentence). Keep new
  filter/derivation logic there, not scattered across components.
- Escape closes whichever overlay is open (modal first, then drawer) — see
  the global key handler in `App.tsx`. Keep new overlays wired into that
  instead of adding their own Escape handling.
- Dark mode: `styles.css` defines light tokens on `:root`, dark overrides
  under `prefers-color-scheme: dark` and `[data-theme="dark"]`. Nothing in
  the app currently sets `data-theme`, so dark mode only follows the OS
  setting — there is no in-app toggle. If you add one, use the existing
  `data-theme` attribute rather than a new mechanism.
- Sentence case in UI copy. No emoji anywhere.

### Known gaps, not bugs to "fix" silently

- **Service levels and groups are extensible.** Add Service Level (Add view)
  appends to `store.levels` — either an existing group or a new one, which
  becomes its own matrix tab (`Group` is a plain string; `Section.g` links a
  section to its group). SL0 and SL1/3/4 are only the seed groups; special
  behaviour keyed on `'SL0'` (default answers, no WO label) is deliberate. Never
  import the seed `DEFAULT_LEVELS` for rendering; read `useStore(s => s.levels)`
  and pass it to `SLNAME(s, levels)` / `GOF`.
- **Not fully offline.** `index.html` loads Barlow / Barlow Condensed from
  Google Fonts. If this ever needs to run on a locked-down laptop with no
  internet, that's a deliberate call to make (self-host the fonts), not an
  oversight to patch reflexively.
- **No test suite.** There is no Playwright/Vitest setup in `web/`. If you
  add one, put it under `web/` and wire it into `package.json` scripts.

## Running and testing

```bash
cd web
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint       # oxlint
```

Needs Node 20+ (Vite 8 requires it; check with `node --version` before
debugging a mysterious `styleText` / ESM error on older Node).

There is no automated test suite yet. Manually exercise the matrix, drawer,
add flows, and PDF export after any change that touches them, at minimum.

## Regenerating data

`web/src/data/checklist-data.json` (and the thin `checklist-data.ts` wrapper
around it) is generated, not hand-edited. The generator, `tools/extract.py`,
is **not checked into this repo** — it only exists inside
`cpf-master-checklist_3.zip` at the repo root, which is kept as a historical
reference. If the source workbook changes and the data needs regenerating,
pull `tools/extract.py` out of that zip first.

It needs `openpyxl` and prints what it dropped — expect ~23 junk options and
6 duplicate answers on rev 18. See ARCHITECTURE.md for why.

## Things that look like bugs but are not

- `Issue?` and `Exclusive?` from the Excel are gone. Across all 802 options they
  were exact inverses, so the model keeps one flag: `bad`. Do not reintroduce
  both columns.
- SL1, SL3 and SL4 tasks have **no answers**. The ACP export has none for them.
  The UI says so rather than hiding it. Do not fabricate defaults.
- 13 of 617 Excel rows are missing from the data. They have no value in the
  "In which InTouch documents" column, so there is nothing to attach them to.
  They need a human decision, not a parser change.
- No check currently has `swi: 1` in the seed data even though the field and
  UI exist — that's the source data, not a rendering bug.
