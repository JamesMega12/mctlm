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
| **Drift** | WorkRight no longer matches the master. |
| **Pending** | Added or edited here, not yet entered in WorkRight. |
| **WorkRight** | The SLB system of record that checks are scraped from. |
| **InTouch / ACP** | The source documents the current Excel was built from. |

Never write "CPF-376" and "CPF-377" as separate units. Never treat SL0 as a
single level — it is four documents.

## The rule that drives the design

WorkRight seeded the data. After that **the app is the source of truth**, and
TLM types changes into WorkRight by hand. So:

- Any add or edit sets the affected rows to `pending`, never `synced`.
- Nothing is ever written back to WorkRight automatically. Write-back was
  explicitly deferred — do not build it without asking.
- The weekly scrape only ever *flags* differences. It must never silently
  overwrite the master, in either direction.
- Phase 1 is **add-only**: no delete-check flow. Editing wording and toggling
  which documents a check appears in is in scope; deleting a check is not.
  (Sections *can* be removed, cascading to their checks — see
  `SectionDrawer.tsx`. That's a deliberate exception, not a precedent for
  deleting individual checks.)

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

- **Add Service Level is a stub.** `AddView.tsx`'s Service level tab only
  toasts; it doesn't add a real level. Wiring it up is real scope, not a
  quick fix — service levels are structural (`GROUPS`/`SLNAME` in
  `lib/constants.ts`), not a data row like units.
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
- Sync statuses in the demo are randomly generated from a fixed seed
  (`makeRng` in `lib/constants.ts`) so the review queue has something in it.
  Real statuses come from the scrape.
- No check currently has `swi: 1` in the seed data even though the field and
  UI exist — that's the source data, not a rendering bug.
