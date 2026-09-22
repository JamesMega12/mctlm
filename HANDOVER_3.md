# Handover

State of the CPF master checklist project as of 17 September 2026.

## Where it stands

A clickable demo of the app, running on the real rev 18 data. It is a
prototype for stakeholder review, not a foundation to build the product on:
no backend, no persistence, no scraper. What it does prove is the data model
and the interactions TLM asked for.

Done:

- Data model validated against the real workbook — checks x units x service
  levels, with the 28 documents as first-class rows.
- Matrix view with unit set filters: any / all / only / missing.
- Check detail with impact ("this touches 8 documents across 4 units"),
  editable wording, answers, comments and SWI flag.
- Add a check from any section heading, with look-alike detection and a
  confirm gate before a duplicate is created.
- Tickable document grid, add and remove.
- PDF export of any mix of units and levels, one document per page.
- Review queue for drift and pending items.

Not started: the scraper, any database, authentication, persistence.

## The next real piece of work

**The WorkRight scraper spec.** It is blocked on one thing:

> Screenshots of a reusable component page and a unit checklist page in
> WorkRight, ideally with DevTools open on a check row.

The question that matters is whether a **stable component ID** is visible in
the page HTML. Everything downstream depends on it:

- With an ID, matching a scraped check to a stored one is exact.
- Without one, matching falls back to check wording, which will produce false
  drift on every look-alike row — and the rev 18 cleanup showed there are
  plenty of those.

Test this in the first scraper spike, before building anything else.

What the scraper has to produce, by table:

| Target | Fields | Risk |
|---|---|---|
| `CHECK` | component ID, wording, section, SWI, comments | ID may not be in the DOM |
| `OPTION` | text, order, good/defect | wording drift; the Options 6+ column in the Excel is junk |
| `UNIT` | unit name, 376/377 as one | may be split in WorkRight |
| `SERVICE_LEVEL` | SL0 sub-check, SL1/3/4 | naming inconsistency ("RigUp" vs "Rigup") |
| `UNIT_CHECK_SL` | which checklist each component appears in | needs crawling all 28 checklists, not just the component library |
| `SECTION` | heading, WO classification | may only exist inside checklist pages |

Also needs: run mechanics (manual vs scheduled, inside a logged-in TLM
session), output format (JSON per run beats Excel for diffing), and failure
handling — **a partial scrape must never be read as "these checks were
deleted"**.

## Open decisions

1. **Do SL1/SL3/SL4 tasks have answers in WorkRight?** The ACP export has none
   for them. If WorkRight holds even a standard Done / Not done / Defect set,
   `OPTION` applies at every level and the export gains a column. Check this
   while taking the screenshots.
2. **The 13 unparsed rows.** 13 of 617 Excel tasks have no value in the
   "In which InTouch documents" column, so they are not in the demo. Someone
   has to look at them and say which documents they belong to.
3. **Automated write-back to WorkRight.** Deferred, not rejected. If it comes
   back: permission to write is a separate approval from permission to scrape,
   every push needs human approval, pushes go one change at a time, and each
   one is verified by re-scraping that record. Build read-and-reconcile first.
4. **Deleting checks.** Phase 1 is add-only. Delete is probably the last thing
   to automate, if ever.

## Risks worth repeating

- **Silent overwrite.** The weekly scrape must only ever flag. If it starts
  auto-applying in either direction, TLM's edits or WorkRight's edits get lost
  with no trace.
- **Scraper fragility.** A UI-driven scraper breaks whenever WorkRight's markup
  changes. Ask whether an official export or API exists before investing in it.
- **Matching on wording.** See above. This is the single biggest technical
  risk in the project.

## Data quality found in rev 18

Not bugs in the code — they are in the source workbook, and the scraper will
meet the same things:

- 23 junk "options" from footer text bleeding out of merged cells in the
  Options 6+ column ("SLB-Pri", "V5.0, 26-Aug-25", "CPF-573 Asset Care
  Program"). Dropped by regex in `tools/extract.py`.
- 6 answers duplicated within a single check, e.g. "No pending deficiencies"
  listed twice with a stray trailing page number.
- Trailing page numbers stuck to option text.
- `Issue?` and `Exclusive?` are perfectly inverse across all 802 options, which
  is why the model now carries one good/defect flag.

## If the demo is the starting point

It was built to be thrown away, but the parts worth keeping are:

- `tools/extract.py` — especially `docs()`, which parses the InTouch document
  cell format. The nearest thing to a written spec for it.
- The data model in ARCHITECTURE.md.
- The interaction design: the four filter modes and the impact view are the
  features that make this better than the spreadsheet.

Rewrite the rest against a real database. Do not try to grow `app.js` into
production code — it re-renders everything on every keystroke and holds all
state in module variables, which is fine for 604 rows and a demo, and wrong
for anything with a backend.
