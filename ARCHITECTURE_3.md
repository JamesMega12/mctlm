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

`UNIT_CHECK_SL` is the whole point. One row is one check inside one of the 28
documents. The Excel encodes this as text in a cell
(`376/377: SL3,SL4 | 577: SL3`), which is why filtering and impact analysis
are painful there and cheap here.

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

No backend. The whole app is three files plus a static file server.

```
index.html     24 lines   shell only: nav, drawer, modal, toast, script tags
styles.css    141 lines   design tokens + every rule; light and dark
app.js        246 lines   all state, rendering and logic
data.js       generated   window.CHECKLIST_DATA — 604 checks, 61 sections
server.js                 static server, no dependencies
tools/extract.py          rebuilds data.js from the ACP workbook
tests/smoke.mjs           15 Playwright assertions
vendor/                   jsPDF + autotable, bundled for offline use
```

### State

Everything lives in module-scope variables in `app.js`, mutated in place and
re-rendered. Nothing persists across a refresh.

```js
checks[]     // {id, n, o:[{t,bad}], s, g, swi, c, wr, rows:[{u,s,st}], history:[]}
sections[]   // {id, name, wo}
mismatches[] // {check, u, s, type, opt, app, wr, done}

view mg q fsec fst          // which screen, which tab, search and filters
fu fs mode onlyCols         // unit/level filter chips and match mode
openRow editing             // matrix expansion, drawer edit mode
expU expL expGrp expAns     // export dialog selection
```

`c.rows` is the in-memory `UNIT_CHECK_SL`: one entry per document the check
appears in, each carrying its own `st` (`synced` | `pending` | `drift`).

### Rendering

Four screens, switched by `render()`: `dash`, `matrix`, `add`, `review`.
Each writes `innerHTML` into `#main`. The drawer (`drawD`) and the modal
(`openM`) render independently on top.

`drawRows()` is the hot path — it re-renders the whole matrix body on every
keystroke in the search box. At 604 checks that is fine. If the dataset grows
past a few thousand, that is the first thing to fix.

### Notable functions

| Function | Does |
|---|---|
| `drawRows` | Matrix body: section headers with `+`, rows, expanded answer strip |
| `unitMatch` / `has` / `levels` | The four unit filter modes: any, all, only, missing |
| `drawD` | The whole detail drawer, in view or edit mode |
| `saveEdit` | Applies edits, flips affected rows to pending, writes history |
| `toggleUse` | Ticks/unticks one document; refuses to empty a check to zero |
| `saveNew` -> `commitNew` | Add flow, with the similarity gate in between |
| `sim` | Jaccard overlap on 3+ letter words. Powers look-alike detection at 0.5 (add form) and 0.55 (drawer) |
| `exportPdf` | Builds one page per selected unit x level pair |

### Export

`exportPdf` takes the export dialog's unit and level selection, crosses them
into document pairs, orders them by unit or level, and emits one autotable page
each. The matrix's search, section and status filters still apply — the PDF
subtitle records them so a printed copy says what it covers.

It prefers the claude.ai `downloads` capability when the page runs as a
published artifact, and falls back to `doc.save()` locally. That is the only
line of platform-specific code in the app.

### Data extraction

`tools/extract.py` reads two sheets and flattens them. Worth knowing:

- The SL0 sheet has options in columns 2–16 as (text, issue, exclusive)
  triples, plus an "Options 6+" overflow column at 28 that is **dirty** —
  it carries page footers and version strings bleeding out of merged cells
  ("SLB-Pri", "V5.0, 26-Aug-25"). The script drops those by regex and reports
  the count. The real scraper must not trust that column.
- Trailing page numbers are stripped from option text (`"No pending
  deficiencies      3"`), and answers duplicated within a check are removed.
- `docs()` parses the `376/377: SL3,SL4 | 577: SL3` cell into unit/level pairs.
  This parser is the closest thing to a spec for the format and is a good
  starting point for the scraper's own parsing.
