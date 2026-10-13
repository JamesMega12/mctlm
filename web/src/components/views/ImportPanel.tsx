import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { SLNAME } from '../../lib/constants';
import { applyPlan, type ItemDecision, type MasterDraft } from '../../lib/importer/apply';
import { buildPlan, SUGGEST_MIN } from '../../lib/importer/match';
import { byPath, fileKey, filesFromDrop, isPdf } from '../../lib/importer/files';
import { readPdf } from '../../lib/importer/read';
import type { ParsedDoc } from '../../lib/importer/types';
import { tallyPlan } from '../../lib/importer/tally';
import ImportDocCard from '../ImportDocCard';

/** Share of a close match we offer to link in one go. Stricter than the 85%
 * shown per item: this one skips the per-item look. */
const BULK_LINK_MIN = 0.95;

/** Import InTouch ACP documents (PDF) into the master checklist. Reads each
 * file in the browser, shows what it would change, and only writes once the
 * user presses Import. One PDF is one unit at one service level; pick several
 * at once for a bulk update. */
export default function ImportPanel() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const units = useStore((s) => s.units);
  const levels = useStore((s) => s.levels);
  const nextCheckId = useStore((s) => s.nextCheckId);
  const nextSectionId = useStore((s) => s.nextSectionId);
  const importLog = useStore((s) => s.importLog);
  const lastImport = useStore((s) => s.lastImport);
  const applyImport = useStore((s) => s.applyImport);
  const undoImport = useStore((s) => s.undoImport);
  const resetData = useStore((s) => s.resetData);

  const [docs, setDocs] = useState<ParsedDoc[]>([]);
  /** One per doc, same order: identifies the file so it isn't queued twice. */
  const [keys, setKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Record<number, ItemDecision>>>({});
  const [untick, setUntick] = useState<Record<number, boolean>>({});
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [over, setOver] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  // The review plays the batch through in order on a scratch copy, exactly as
  // Import will, so a check that an earlier file adds shows as already there
  // for a later one instead of being counted as new twice.
  const { plans, scratchChecks } = useMemo(() => {
    const sim: MasterDraft = structuredClone({
      checks,
      sections,
      units,
      addedUnits: [],
      levels,
      nextCheckId,
      nextSectionId,
    });
    const built = docs.map((d, i) => {
      const plan = buildPlan(d, sim, { suggestBelowId: nextCheckId });
      if (!plan.blockers.length) {
        applyPlan(sim, plan, { decisions: decisions[i] ?? {}, untickMissing: !!untick[i], when: '', who: '' });
      }
      return plan;
    });
    return { plans: built, scratchChecks: sim.checks };
  }, [docs, decisions, untick, checks, sections, units, levels, nextCheckId, nextSectionId]);
  const tallies = plans.map((p, i) => tallyPlan(p, decisions[i] ?? {}, checks));
  const ready = plans.filter((p) => !p.blockers.length);

  // Files or whole folders, from the picker or a drop. Only PDFs are read, and a
  // file already in the list is skipped so choosing a folder twice is harmless.
  const readFiles = async (files: File[]) => {
    const pdfs = files.filter(isPdf);
    const fresh = pdfs.filter((f) => !keys.includes(fileKey(f))).sort(byPath);
    const skipped = pdfs.length - fresh.length;
    const other = files.length - pdfs.length;
    setNotice(
      !pdfs.length
        ? `No PDF files found${files.length ? ` (${files.length} other file${files.length !== 1 ? 's' : ''} ignored)` : ''}.`
        : [
            skipped ? `${skipped} file${skipped !== 1 ? 's were' : ' was'} already in the list.` : '',
            other ? `${other} non-PDF file${other !== 1 ? 's' : ''} ignored.` : '',
          ]
            .filter(Boolean)
            .join(' ') || null,
    );
    if (!fresh.length) return;
    setReading({ done: 0, total: fresh.length });
    const added: ParsedDoc[] = [];
    for (const f of fresh) {
      added.push(await readPdf(f));
      setReading({ done: added.length, total: fresh.length });
    }
    setDocs((cur) => [...cur, ...added]);
    setKeys((cur) => [...cur, ...fresh.map(fileKey)]);
    setReading(null);
  };

  const clear = () => {
    setDocs([]);
    setKeys([]);
    setDecisions({});
    setUntick({});
    setNotice(null);
  };

  const decide = (doc: number, idx: number, d: ItemDecision | undefined) =>
    setDecisions((cur) => {
      const next = { ...(cur[doc] ?? {}) };
      if (d === undefined) delete next[idx];
      else next[idx] = d;
      return { ...cur, [doc]: next };
    });

  // Plans are keyed by position, so removing one shifts the rest: reset the choices.
  const remove = (i: number) => {
    setDocs((cur) => cur.filter((_, k) => k !== i));
    setKeys((cur) => cur.filter((_, k) => k !== i));
    setDecisions({});
    setUntick({});
  };

  const closeLinks = plans.flatMap((p, di) =>
    p.items.flatMap((it, i) =>
      it.checkId === null && it.suggestion && it.suggestion.score >= BULK_LINK_MIN && !(decisions[di]?.[i]) ? [{ di, i, id: it.suggestion.checkId }] : [],
    ),
  );
  const linkClose = () =>
    setDecisions((cur) => {
      const next = { ...cur };
      for (const { di, i, id } of closeLinks) next[di] = { ...(next[di] ?? {}), [i]: { link: id } };
      return next;
    });

  const totals = tallies.reduce(
    (a, t, i) => (plans[i].blockers.length ? a : { add: a.add + t.add, tick: a.tick + t.tick, untick: a.untick + (untick[i] ? t.missing.length : 0) }),
    { add: 0, tick: 0, untick: 0 },
  );
  const unresolved = plans.reduce(
    (n, p, di) => n + p.items.filter((it, i) => it.checkId === null && it.suggestion && decisions[di]?.[i] === undefined).length,
    0,
  );

  const doImport = () => {
    applyImport(
      plans.flatMap((p, i) => (p.blockers.length ? [] : [{ doc: p.doc, decisions: decisions[i] ?? {}, untickMissing: !!untick[i] }])),
    );
    clear();
  };

  return (
    <div className="imp">
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          // Folders are expanded here; the drop's entries must be read in this tick.
          void filesFromDrop(e.dataTransfer).then(readFiles);
        }}
      >
        <p style={{ margin: 0 }}>
          <b>Drop InTouch ACP documents (PDF) or a whole folder here</b>
        </p>
        <div className="frow imp-pick">
          <label className="btn">
            Choose files
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                void readFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </label>
          <label className="btn ghost">
            Choose folder
            <input
              type="file"
              multiple
              hidden
              // Not in React's input typings: asks the browser for a folder and all it contains.
              {...{ webkitdirectory: '' }}
              onChange={(e) => {
                void readFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Each PDF is one unit at one service level. A folder is searched including its subfolders, and anything that
          isn't a PDF is ignored. You review what changes before anything is saved.
        </p>
      </div>

      {notice && (
        <p className="muted" role="status" style={{ margin: 0 }}>
          {notice}
        </p>
      )}

      {reading && (
        <p className="muted" role="status">
          Reading {reading.done} of {reading.total}…
        </p>
      )}

      {docs.length > 0 && (
        <>
          <div className="panel imp-sum">
            <div>
              <b>{ready.length}</b> of {docs.length} document{docs.length !== 1 ? 's' : ''} ready: <b>{totals.add}</b> new
              check{totals.add !== 1 ? 's' : ''}, <b>{totals.tick}</b> to tick
              {totals.untick > 0 && (
                <>
                  , <b>{totals.untick}</b> to untick
                </>
              )}
              .
              {unresolved > 0 && (
                <span className="muted">
                  {' '}
                  {unresolved} new-looking check{unresolved !== 1 ? 's' : ''} resemble existing ones: review them below.
                </span>
              )}
            </div>
            <div className="frow">
              <button className="btn" disabled={!ready.length} onClick={doImport}>
                Import {ready.length} document{ready.length !== 1 ? 's' : ''}
              </button>
              {closeLinks.length > 0 && (
                <button
                  className="btn ghost"
                  onClick={linkClose}
                  title={`Treat checks that are at least ${Math.round(BULK_LINK_MIN * 100)}% the same wording as the existing check, and remember the new wording for next time`}
                >
                  Link {closeLinks.length} close match{closeLinks.length !== 1 ? 'es' : ''} (≥{Math.round(BULK_LINK_MIN * 100)}%)
                </button>
              )}
              <button className="linkbtn" onClick={clear}>
                Clear
              </button>
            </div>
          </div>

          {plans.map((p, i) => (
            <ImportDocCard
              key={`${p.doc.fileName}-${i}`}
              plan={p}
              tally={tallies[i]}
              decisions={decisions[i] ?? {}}
              untick={!!untick[i]}
              checks={scratchChecks}
              levels={levels}
              defaultOpen={plans.length === 1}
              onDecide={(idx, d) => decide(i, idx, d)}
              onUntick={(v) => setUntick((cur) => ({ ...cur, [i]: v }))}
              onRemove={() => remove(i)}
            />
          ))}

          {/* Same action as the button at the top, so after reviewing a long list there is no scrolling back up. */}
          <div className="imp-foot">
            <span className="muted">
              {totals.add} new, {totals.tick} to tick
              {totals.untick > 0 && `, ${totals.untick} to untick`}
            </span>
            <button className="btn" disabled={!ready.length} onClick={doImport}>
              Import {ready.length} document{ready.length !== 1 ? 's' : ''}
            </button>
          </div>

          <p className="muted" style={{ fontSize: 14 }}>
            "Close to an existing check" starts at {Math.round(SUGGEST_MIN * 100)}% similarity. Nothing is merged on
            similarity alone: choose "Same check" and the new wording is remembered, so the next import matches it by
            itself. Files in one import are applied in order, so a check added by an earlier file is matched, not
            added again, by a later one.
          </p>
        </>
      )}

      <div className="panel imp-log">
        <h3>Saved in this browser</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          The checklist, including everything imported, is kept in this browser's local storage and is still here when
          you reload. It isn't shared with other computers or browsers.
        </p>
        {importLog.length > 0 ? (
          <table className="opt">
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>Unit and level</th>
                <th>Version</th>
                <th>Added</th>
                <th>Ticked</th>
                <th>Unticked</th>
              </tr>
            </thead>
            <tbody>
              {importLog.slice(0, 10).map((e, i) => (
                <tr key={i}>
                  <td>{e.at}</td>
                  <td>{e.file}</td>
                  <td>
                    CPF-{e.unit} · {SLNAME(e.level, levels)}
                  </td>
                  <td>{e.version ?? ''}</td>
                  <td>{e.created}</td>
                  <td>{e.ticked}</td>
                  <td>{e.unticked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No documents imported yet.</p>
        )}
        <div className="frow" style={{ marginTop: 10 }}>
          <button className="btn ghost" disabled={!lastImport} onClick={undoImport}>
            Undo last import{lastImport ? ` (${lastImport.files} document${lastImport.files !== 1 ? 's' : ''})` : ''}
          </button>
          <button
            className="linkbtn"
            onClick={() => {
              if (!resetArmed) {
                setResetArmed(true);
                return;
              }
              setResetArmed(false);
              resetData();
            }}
            onBlur={() => setResetArmed(false)}
          >
            {resetArmed ? 'Click again to erase all saved changes' : 'Reset to the seed data'}
          </button>
        </div>
      </div>
    </div>
  );
}
