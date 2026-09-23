# CPF Master Checklist

A local demo of a master checklist database for TLM (Technology Lifecycle
Management). It replaces an Excel sheet that tracks which maintenance checks
belong to which CPF unit at which service level.

This is a **demo, not the product** — all state lives in memory and resets on
refresh. There's no backend, no database, and no live connection to
WorkRight (the real system of record). See [`../HANDOVER.md`](../HANDOVER.md)
for project status and [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the
data model this is a prototype of.

## Run it

Needs Node 20+ (Vite 8 requires it).

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build       # type-check then production build
npm run preview     # serve the production build locally
npm run lint         # oxlint
```

Needs an internet connection on first load — fonts (Barlow / Barlow
Condensed) are pulled from Google Fonts, everything else is local.

## What it does

- **Dashboard** — sync status at a glance: checks in sync / pending /
  drifted from WorkRight, a per-unit breakdown, and a shortlist of items
  needing attention.
- **Matrix** — the main working view. Checks as rows, unit x service-level
  documents as columns. Filter by unit set (any / all / only / missing a
  selection), service level, section, search text, or sync status. Click a
  cell to tick or untick a check for that document directly; click a row to
  expand its answers, or double-click to open the full detail drawer in edit
  mode.
- **Check detail drawer** — wording, answers, comments, SWI flag, an impact
  summary ("touches 8 documents across 4 units"), a full document tick grid,
  look-alike detection, and an edit history.
- **Sections** — a section drawer to rename a section, see every check in
  it, and remove it (cascades to its checks, with a confirm step). Add new
  sections from either the matrix or the Add view.
- **Add view** — add a check (with live look-alike warnings before saving),
  add a unit (units are user-extensible — a new one starts with no checks
  assigned). *Add service level is a stub for now* — it toasts but doesn't
  add a real column.
- **Review queue** — resolve drift found by the (simulated) weekly WorkRight
  scrape, see everything still pending entry into WorkRight, and a log of
  what's already been resolved.
- **PDF export** — pick any mix of units and service levels; exports one
  checklist per document, respecting whatever filters are active in the
  matrix.

## Data

604 checks across 61 sections, extracted from the InTouch ACP rev 18 export
(`src/data/checklist-data.json`). Answers are good/defect only — the
source's `Issue?` and `Exclusive?` columns were always exact inverses, so the
model keeps a single flag. Sync statuses (pending/drift) are simulated from a
fixed seed so the review queue has something in it on every load — real
statuses will come from the WorkRight scraper once it exists.

The extraction script that generates this data isn't checked into this repo;
see [`../CLAUDE.md`](../CLAUDE.md) if it ever needs regenerating.
