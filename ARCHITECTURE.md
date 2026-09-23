# Architecture

Two things are described here: the **demo that exists** in this repo, and the
**system it is a prototype of**. Keep them apart when reading.

---

## 1. The target system

```
  WorkRight (SLB)                     seeded once, then compared weekly
       |
       |  browser extension scrapes checks, units, documents
       v
  Scraper output (JSON per run)
       |
       +--> [seed]    validate --> master checklist DB
       |
       +--> [weekly]  compare against DB --> mismatches --> review queue
                                                  ^
  master checklist DB  <--------------------------+
       |  ^
       |  |  TLM adds / edits / resolves
       v  |
     Web app  ----> TLM types the change into WorkRight by hand
```

The loop back into WorkRight is **manual and deliberate**. Automated write-back
was scoped out; see HANDOVER.md, open decisions.

### Data model

```
SECTION(section_id, name, wo_classification)
   |
   v
CHECK(check_id, workright_id?, section_id, name, swi_needed, comments, source_ref)
   |                                  \
   v                                   v
OPTION(option_id, check_id,        UNIT_CHECK_SL(id, unit_id, check_id, sl_id,
       order, text, bad,                          sync_status, last_seen_in_workright)
       sync_status)                    ^                    ^
                                       |                    |
                          UNIT(unit_id, name)   SERVICE_LEVEL(sl_id, name, group, interval)

SYNC_RUN(run_id, run_at, records_scraped, mismatch_count)
   |
   v
MISMATCH(mismatch_id, run_id, unit_check_sl_id, option_id?, type, resolved_by, resolved_at)
CHANGE_LOG(change_id, entity, entity_id, action, changed_by, changed_at)
```

`UNIT_CHECK_SL` is the whole point. One row is one check inside one document.
The Excel encodes this as text in a cell (`376/377: SL3,SL4 | 577: SL3`),
which is why filtering and impact analysis are painful there and cheap here.

`SERVICE_LEVEL` is flattened: SL0's four sub-checks are their own rows
(`SL0-Rigup`, `group: SL0`). That makes a service level and a document line up
one-to-one, matching how InTouch and WorkRight think.

### Record lifecycle

```
  created/edited in app ──> pending ──(weekly scrape finds it)──> synced
                                                                    |
                                          (scrape finds a difference)
                                                                    v
                                                                  drift
                                                                    |
                              TLM resolves: keep master -> pending, or
                                            fixed in WorkRight -> synced
```

Matching a scraped record to a stored one must key on WorkRight's stable
component ID, never the wording. Wording is where look-alikes and drift live.
Checks created in the app have no ID until they exist in WorkRight, so the
schema keeps `workright_id` nullable and needs a linking step later.

---

## 2. The demo in this repo

Front end only. React 19 + TypeScript, built with Vite. No backend, no
network calls, no persistence — everything lives in one Zustand store and
resets on refresh.

```
web/
  index.html                shell: root div, Google Fonts link, script tag
  src/
    main.tsx                mounts <App />
    App.tsx                 layout shell, view switch, global Escape handler
    styles.css               design tokens + every rule; light and dark
    types.ts                 domain types + raw-data shape
    store/useStore.ts        the entire app state and every mutation, as Zustand+immer actions
    lib/
      constants.ts            unit/level tables, unit-match modes, seeded RNG, demo dates
      derive.ts               pure selectors: filtering, status rollup, summary sentence
      init.ts                 expands raw data into store shape, seeds simulated sync status
      text.ts                 Jaccard similarity for look-alike detection
      pdf.ts                  one-PDF-page-per-document export
    components/
      Nav.tsx, Modal.tsx, Toast.tsx, Drawer.tsx, SectionDrawer.tsx
      views/                  Dashboard, Matrix, MatrixRow, AddView, ReviewQueue
      dialogs/                AddCheckDialog, AddSectionDialog, AddUnitDialog, DupWarnDialog, ExportDialog
    data/
      checklist-data.json     604 checks, 61 sections — generated, never hand-edit
      checklist-data.ts       thin typed wrapper around the JSON import
```

An earlier vanilla-JS build (`app/`, a single self-contained `index.html`)
existed alongside this one while `web/` was reaching feature parity. It has
been removed: `web/` is now strictly ahead of it (directly tickable matrix
cells, section management with cascade-delete, user-extensible units).

### State

Everything lives in one Zustand store (`useStore.ts`), mutated via the immer
middleware and re-rendered by React's normal subscription model — no manual
re-render calls, no virtual-DOM opt-out. Shape, roughly:

```ts
checks[]      // Check — wording, answers, comments, swi flag, per-document rows, history
sections[]    // Section — name, wo group
mismatches[]  // Mismatch — drift records from the (simulated) scrape
units[]       // user-extensible; seeded from DEFAULT_UNITS

view                          // 'dash' | 'matrix' | 'add' | 'review'
mg q fsec fst fu fs mode      // matrix group/search/section/status filters, unit chips, match mode
onlyCols openRow              // column visibility, expanded row
drawerId editing              // check drawer id + edit mode
sectionDrawerId               // section drawer id (mutually exclusive with drawerId)
modal                         // 5-way discriminated union: add-check | add-section | add-unit | dup-warn | export
expU expL expGrp expAns       // export dialog selection, lazily seeded from matrix filters
toastText                     // transient toast message
```

A check's `rows` is the in-memory `UNIT_CHECK_SL`: one entry per document the
check appears in, each carrying its own status (`synced` | `pending` |
`drift`).

Ids (`nextCheckId`, `nextSectionId`) are monotonic counters, never reused —
lookups always go through `getCheck` / `getSection` in `derive.ts`, never
array position.

### Rendering

Four screens, switched by the `view` field and rendered conditionally in
`App.tsx`: `dash`, `matrix`, `add`, `review`. Each is an ordinary React
component subscribing to the slices of the store it needs.

`Matrix.tsx` / `MatrixRow.tsx` are the hot path — 604 checks re-rendered on
every filter change with no virtualization or memoization. That's fine at
this scale; the code says so explicitly (`Matrix.tsx`). If the dataset grows
past a few thousand rows, that's the first thing to fix.

The check drawer (`Drawer.tsx`) and section drawer (`SectionDrawer.tsx`)
share one DOM slot and are mutually exclusive. The modal (`Modal.tsx`) is a
single switchboard over five dialog kinds.

### Notable modules

| Module | Does |
|---|---|
| `lib/derive.ts` | `getCheck`/`getSection` lookup, `counts`, `pendList`, `status` rollup, the four unit-match modes (`any`/`all`/`only`/`missing`), `summary()` prose, `cols()` column visibility |
| `lib/init.ts` | Expands raw JSON into working state; seeds simulated drift/pending sync statuses from a fixed RNG seed so the review queue has content |
| `lib/text.ts` | `sim()` — Jaccard overlap on 3+ letter words. Powers look-alike detection at 0.5 in the add-check form, 0.55 in the drawer |
| `lib/pdf.ts` | Builds one page per selected unit x service-level document, jsPDF + autotable, landscape A4 |
| `store/useStore.ts` | Every state mutation: `saveEdit`, `toggleUse`, `commitNew`, `removeSection`, `resolve`, etc. |

### Export

`lib/pdf.ts` takes the export dialog's unit and level selection, crosses them
into document pairs, orders them by unit or level, and emits one autotable
page each. The matrix's search, section and status filters still apply — the
PDF subtitle records them so a printed copy says what it covers.

It prefers the claude.ai `downloads` capability when the page runs as a
published artifact, and falls back to `doc.save()` locally. That is the only
line of platform-specific code in the app.

### Data extraction

The generator for `checklist-data.json`, `tools/extract.py`, is not checked
into this repo — it lives only inside `cpf-master-checklist_3.zip` at the
repo root, kept as a historical reference. Worth knowing if it's ever pulled
back out:

- The SL0 sheet has options in columns 2–16 as (text, issue, exclusive)
  triples, plus an "Options 6+" overflow column at 28 that is **dirty** —
  it carries page footers and version strings bleeding out of merged cells
  ("SLB-Pri", "V5.0, 26-Aug-25"). The script drops those by regex and reports
  the count. Any future scraper must not trust that column.
- Trailing page numbers are stripped from option text (`"No pending
  deficiencies      3"`), and answers duplicated within a check are removed.
- A `docs()` function parses the `376/377: SL3,SL4 | 577: SL3` cell into
  unit/level pairs. This parser is the closest thing to a spec for the
  format and is a good starting point for the scraper's own parsing.
