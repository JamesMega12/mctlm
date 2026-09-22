# CLAUDE.md

Working notes for Claude Code on this repo. Read this before changing anything.

## What this is

A working demo of a master checklist database for TLM (Technology Lifecycle
Management). It replaces an Excel sheet that tracks which maintenance checks
belong to which CPF unit at which service level.

It is a **demo, not the product**. All state is in memory and resets on
refresh. There is no backend, no database, no scraper yet. See HANDOVER.md for
where the real build starts.

## Domain vocabulary — use these words in code and UI

| Term | Meaning |
|---|---|
| **Check** | One maintenance task. 604 of them. Called a "component" in WorkRight. |
| **Unit** | A cement pump truck: CPF-376/377, CPF-577, CPF-573, CPF-870. **376/377 is ONE unit**, not two. |
| **Service level** | When a check runs. SL0 splits into four: Outgoing, Rigup, RigDown, Incoming. Then SL1 (250h), SL3 (500h), SL4 (annual). Seven in total. |
| **Document** | One unit at one service level. 4 x 7 = **28 documents**. This is the unit of work everywhere — a PDF page, a matrix cell, a row in `c.rows`. |
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

## Stack and conventions

Vanilla JS, no framework, no build step, no dependencies to install. Keep it
that way unless asked — the demo has to run on a locked-down work laptop with
nothing but Node or Python.

- `app.js` is plain functions on `window`, called from inline `onclick`
  handlers in template strings. This is deliberate. Do not convert it to
  React or add a bundler on your own initiative.
- Rendering is full re-render: change state, call `render()` or `drawRows()`.
  There is no diffing and no virtual DOM. Do not add one.
- Escape everything that reaches HTML: `esc()` for text nodes, `att()` for
  attribute values. Check wordings contain quotes, ampersands and em dashes.
- Dark mode is mandatory. Use the CSS variables in `:root` — never a hardcoded
  colour. Every variable has a dark override.
- Sentence case in UI copy. No emoji anywhere.

### CSS specificity traps that have already bitten

`styles.css` has rules that override each other by element+class specificity.
Two that broke the UI during the last change:

- `.form label{display:grid}` beats `.tick{display:flex}`, which stacked every
  checkbox above its label in dialogs. Fixed with `.form label.tick`.
- `table.use td button{border:1px dashed}` beats `.tick2{border:1px solid}`.
  The dashed border on empty document boxes is now intentional — keep it.

After any CSS change, screenshot the matrix, the drawer in edit mode, and both
dialogs before calling it done.

## Running and testing

```bash
node server.js            # or: python -m http.server 3000
node tests/smoke.mjs      # needs: npm i playwright
```

`tests/smoke.mjs` covers all five features TLM asked for, at 15 assertions.
**Run it after every change.** Add an assertion when you add a feature.

Two things it enforces that are easy to break:
- No page-level horizontal scroll at 390px. The matrix scrolls inside
  `.mwrap`, never the page.
- No uncaught page errors.

A trap the test itself hit: steps that edit a check's wording change the data
the duplicate-detection test relies on. Test steps share one page and one
in-memory dataset, so they are order-dependent. Keep edits on row 0.

## Regenerating data

`data.js` is generated. Never hand-edit it.

```bash
python tools/extract.py "CPF Master Checklist - from InTouch ACP_18.xlsx"
```

Needs `openpyxl`. It prints what it dropped — expect 23 junk options and 6
duplicate answers on rev 18. See ARCHITECTURE.md for why.

## Things that look like bugs but are not

- `Issue?` and `Exclusive?` from the Excel are gone. Across all 802 options they
  were exact inverses, so the model keeps one flag: `bad`. Do not reintroduce
  both columns.
- SL1, SL3 and SL4 tasks have **no answers**. The ACP export has none for them.
  The UI says so rather than hiding it. Do not fabricate defaults.
- 13 of 617 Excel rows are missing from `data.js`. They have no value in the
  "In which InTouch documents" column, so there is nothing to attach them to.
  They need a human decision, not a parser change.
- Sync statuses in the demo are randomly generated from a fixed seed so the
  review queue has something in it. Real statuses come from the scrape.
