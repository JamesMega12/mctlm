# CLAUDE.md

Working notes for Claude Code on this repo. Read this before changing anything.

## What this is

A working demo of a master checklist database for TLM (Technology Lifecycle
Management). It replaces an Excel sheet that tracks which maintenance checks
belong to which CPF unit at which service level.

It is a **demo, not the product**. There is no backend, no database, no scraper
yet. The checklist is saved to the browser's `localStorage` (key
`mctlm-master-checklist`) so it survives a refresh; it is per browser, not
shared. See HANDOVER.md for where the real build starts.

Documents can be imported: **Add new → Import document** reads InTouch ACP PDFs
in the browser and updates the matrix. See "Importing InTouch documents" below.

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
- **Tests cover the importer only.** `npm test` runs Vitest over
  `lib/importer/importer.test.ts` (synthetic pages, not real PDFs). There are no
  UI tests; the matrix, drawers and add flows are still checked by hand.

## Running and testing

```bash
cd web
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint       # oxlint
npm test           # vitest: importer parse / match / apply
npm run check:pdfs -- "<folder of InTouch PDFs>"   # parse real PDFs, flag problems
```

Needs Node 20+ (Vite 8 requires it; check with `node --version` before
debugging a mysterious `styleText` / ESM error on older Node). `check:pdfs`
imports the TypeScript sources directly, so it needs Node 24.

Outside the importer there is no automated test suite. Manually exercise the
matrix, drawer, add flows, and PDF export after any change that touches them, at
minimum.

## Importing InTouch documents

**Add new → Import document.** One PDF is one unit at one service level (so a
unit's SL0 is four PDFs). Code lives in `web/src/lib/importer/`:

| File | Job |
|---|---|
| `extract.ts` | pdf.js text runs with x/y per page. No layout decisions. |
| `parse.ts` | Pages to `ParsedDoc`: unit, level, version, items, warnings. |
| `match.ts` | `buildPlan`: compare with the master, nothing is mutated. |
| `apply.ts` | `applyPlan`: carry the plan out on a store draft. |
| `tally.ts` | Counts shown in the review. |
| `read.ts` | Browser only: loads pdf.js lazily, reads a `File`. |

Parser rules (verified against all 28 source PDFs: 1,147 SL0 checks, 1,777
SL1/3/4 checks, no warnings):

- **SL1/3/4**: one U+F099 glyph in the right margin (x > 450) on the first line
  of every check is the only reliable item delimiter. The glyph sits ~2.4pt below
  its line's baseline, so it is matched to the *nearest* line. Bands are
  `WO #N:` (SL1) or `Task Line #N:` (SL3/SL4); sections are `N Name` with N
  counting up by one. Continuation lines and `Note:` lines join the item.
- **SL0**: two columns. Find the gutter from run x-extents (not by slicing text),
  read each page's left column then its right. U+F099 = the pass answer
  (`bad: false`), U+F0A3 = every other answer. A line deeper than the option's
  text is that option wrapping; a line at the title's indent after options starts
  a new check; a *new column* also starts a new check. Floating callouts
  ("WORKING AT HEIGHT!") are indented past the title and are dropped.
- Trim each page to the checks area (below "Checks", above "Equipment status and
  signatures" / the deficiency table) **before** looking for the gutter: the
  intro and sign-off text span both columns and hide it.
- Footers vary: `V4.1, 14-Aug-26`, `Rev 3.1, 2-Sep-26` and `V2.3 19-Aug-26` (no comma) all occur.
- **Levels are read from the title, not assumed.** `Service Level 10` is SL10 (not
  SL1), `Service Level X` / `SLX` is SLX, and an unfamiliar SL0 kind ("Pre-Job
  Check, Service Level 0") becomes its own level. An unknown level is created on
  import and the review says so. A numbered one (SL2) joins SL1/3/4; a **lettered
  one (SLX) becomes a service level of its own: a new group, so its own matrix
  tab**, named after it. Checks belong to one group, so there is nothing to match
  against on a first SLX import: the card shows a plain "Will be added" list by
  section instead of per-check choices, and a later SLX document matches only checks
  already in the SLX group.
- **The layout, not the title, picks the reader**: bulleted answers = SL0 reader;
  a right-margin marker per check = SL1/3/4 reader; neither = spacing reader.
- **The 2-year SLX document has no OK circles** but is the same table template as
  SL1/3/4 (numbered rows, blue section bars). Row lines are read from the page's
  drawing commands (`extract.ts` `readRules`, pdf.js 6 path format; `[]` if the
  shape differs): a check starts only where a line lies between two text lines, so
  a row holding several paragraphs stays one check (14 on the real file; spacing
  alone split one row and gave 15). Without row lines it falls back to a gap of
  1.5x the line pitch (`Note:` lines ~1.3x stay put). At a page top neither exists,
  so a capitalised line after a finished sentence starts one. It is still not a
  count, so the card carries a "skim the list" warning.
- **"CPF-XXX"** (the 2-year SLX document's title) is just a unit called `XXX`: it is
  added on import like any new unit (CPF-637 was), and gets a column in every tab.
- A document with **no WO bands** outside SL0 gets a band named after its level
  (`bandFor`), so its sections show under their own matrix heading rather than
  being folded into a same-named section of WO #1 to #5.
- A unit the app doesn't have (CPF-637) is added on import.
- Hyphenated wraps (`up-to-` / `date.`) join without a space.

Matching rules (follow the hand-built sheet; see the handoff note's look-alike
section for why):

- A document item is the same check only when the wording is **identical**
  (case, spacing, dash and quote glyphs ignored) or was linked before
  (`Check.alias`). **Never merge on similarity.** Close wordings (Dice >= 85%)
  are only *suggested*; the user chooses "Same check", which stores the new
  wording as an alias so it matches by itself next time.
- "Replace check" (`{ replace: id }`) is the other choice on a close match: the
  existing check takes the document's wording (and, on SL0 only, its answers)
  and keeps the old wording as an alias, with a history entry. "Same check"
  (`{ link: id }`) keeps the existing wording instead.
- Match within the section and WO first; same wording under another section is
  accepted only if exactly one check has it.
- Suggestions only point at checks that existed before the batch
  (`suggestBelowId`). Checks a file earlier in the batch will create get ids that
  shift if the user changes an earlier choice.
- The review simulates the batch in order on a scratch copy, so its counts equal
  what Import does. `applyImport` re-plans each file against the live data.
- Unticking checks that are no longer in a document is opt-in, per document.
- Never commit the source PDFs: they are marked SLB-Private. Tests use synthetic
  pages; real-PDF checks go through `npm run check:pdfs`.

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
  The Answers section is hidden for every group except SL0 (matrix row detail,
  check drawer, add-check dialog). Do not fabricate defaults.
- 13 of 617 Excel rows are missing from the data. They have no value in the
  "In which InTouch documents" column, so there is nothing to attach them to.
  They need a human decision, not a parser change.
- No check currently has `swi: 1` in the seed data even though the field and
  UI exist — that's the source data, not a rendering bug.
