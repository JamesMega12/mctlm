import { groupLabel, SLNAME } from '../lib/constants';
import type { ItemDecision } from '../lib/importer/apply';
import type { ImportPlan } from '../lib/importer/match';
import { markChanged } from '../lib/importer/diff';
import type { DocTally } from '../lib/importer/tally';
import type { Check, LevelMap } from '../types';

interface Props {
  plan: ImportPlan;
  tally: DocTally;
  decisions: Record<number, ItemDecision>;
  untick: boolean;
  /** For looking up existing wording by id. */
  checks: Check[];
  levels: LevelMap;
  defaultOpen: boolean;
  onDecide: (idx: number, d: ItemDecision | undefined) => void;
  onUntick: (v: boolean) => void;
  onRemove: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The items grouped by section, in document order. */
function sectionsOf(items: ImportPlan['items']) {
  const groups: { key: string; name: string; items: ImportPlan['items'] }[] = [];
  for (const it of items) {
    const key = `${it.parsed.band ?? ''}|${it.parsed.sectionNo}|${it.parsed.sectionName}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, name: it.parsed.sectionName, items: [it] });
  }
  return groups;
}

/** `text` with the words that `other` doesn't have marked, to show at a glance
 * what differs between two close wordings. */
function Diff({ text, other }: { text: string; other: string }) {
  return (
    <>
      {markChanged(text, other).map((p, i) => (p.changed ? <mark key={i}>{p.t}</mark> : p.t))}
    </>
  );
}

/** One document in the import review: what it would add, tick and leave
 * alone, with a choice per new-looking check. Nothing changes until the user
 * presses Import on the panel. */
export default function ImportDocCard({
  plan,
  tally: t,
  decisions,
  untick,
  checks,
  levels,
  defaultOpen,
  onDecide,
  onUntick,
  onRemove,
}: Props) {
  const checkText = (id: number) => checks.find((c) => c.id === id)?.n ?? '';
  const blocked = plan.blockers.length > 0;

  const newItems = plan.items.flatMap((it, i) => (it.checkId === null || decisions[i] === 'new' ? [{ it, i }] : []));
  const tickItems = plan.items.flatMap((it, i) => (it.checkId !== null && !it.alreadyIn && decisions[i] === undefined ? [{ it, i }] : []));
  const elsewhere = plan.items.filter((it) => it.via === 'elsewhere').length;
  const answersDiffer = plan.items.filter((it) => it.answersDiffer).length;

  return (
    <details className="panel imp-card" open={defaultOpen}>
      <summary>
        <b className="imp-file">{plan.doc.fileName}</b>
        <span className="muted">
          {plan.unit ? `CPF-${plan.unit}` : 'Unit ?'} · {plan.level ? SLNAME(plan.level, levels) : 'Level ?'}
          {plan.doc.version ? ` · ${plan.doc.version}` : ''}
        </span>
        {blocked ? (
          <span className="pill bad">Can't import</span>
        ) : (
          <>
            <span className="pill">{plan.items.length} checks</span>
            {t.add > 0 && <span className="pill ok">{t.add} new</span>}
            {t.tick > 0 && <span className="pill ok">{t.tick} to tick</span>}
            {t.missing.length > 0 && <span className="pill pend">{t.missing.length} not in document</span>}
            {t.add + t.tick + t.missing.length === 0 && <span className="pill">no changes</span>}
          </>
        )}
        <button
          className="x imp-x"
          type="button"
          aria-label={`Remove ${plan.doc.fileName}`}
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          ×
        </button>
      </summary>

      {(plan.blockers.length > 0 || plan.doc.warnings.length > 0 || (!blocked && (plan.createsUnit || plan.createsLevel))) && (
        <div className="imp-notes">
          {plan.blockers.map((b) => (
            <p className="err" key={b}>
              {b}
            </p>
          ))}
          {!blocked && plan.createsUnit && <p className="warn">New unit: CPF-{plan.unit} will be added to the checklist.</p>}
          {!blocked && plan.createsLevel && (
            <p className="warn">
              New service level: "{plan.level}" will be added
              {plan.createsGroup ? ` as its own tab, with a "${plan.level}" column for every unit.` : ` to ${groupLabel(plan.group)} as a column for every unit.`}
              {plan.group !== 'SL0' && plan.items.some((it) => !it.parsed.band) && (
                <> The document has no work-order headings, so its sections are shown under a "{plan.level}" heading.</>
              )}
            </p>
          )}
          {plan.doc.warnings.length === 1 && <p className="warn">{plan.doc.warnings[0]}</p>}
          {plan.doc.warnings.length > 1 && (
            <div className="warn">
              <b>The reader flagged {plan.doc.warnings.length} things in this file:</b>
              <ul>
                {plan.doc.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!blocked && (
        <>
          {!plan.createsGroup && (
          <p className="muted imp-note">
            {t.unchanged} already match and are ticked.
            {elsewhere > 0 && ` ${elsewhere} matched by wording but sit under a different section in the checklist (kept there).`}
            {answersDiffer > 0 && ` ${answersDiffer} have different answer lists than the checklist (the checklist's are kept).`}
          </p>
          )}

          {plan.createsGroup && newItems.length > 0 && (
            <div className="imp-group">
              <h4>Will be added ({newItems.length})</h4>
              <p className="muted imp-note">
                Nothing in the checklist belongs to {plan.level} yet, so there is nothing to match against: every check is new.
              </p>
              {sectionsOf(newItems.map(({ it }) => it)).map((g) => (
                <div key={g.key}>
                  <div className="imp-sec">{g.name}</div>
                  <ol className="imp-list">
                    {g.items.map((it, k) => (
                      <li key={k}>{it.parsed.text}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {!plan.createsGroup && newItems.length > 0 && (
            <div className="imp-group">
              <h4>Not in the checklist yet ({newItems.length})</h4>
              {newItems.map(({ it, i }) => {
                const d = decisions[i];
                const sug = it.suggestion;
                const choice = d === 'skip' ? 'skip' : typeof d === 'object' ? ('replace' in d ? 'replace' : 'link') : 'new';
                return (
                  <div className="imp-new" key={i}>
                    <div className="imp-sec muted">
                      {it.parsed.sectionName}
                      {it.parsed.band ? ` · ${it.parsed.band}` : ''}
                    </div>
                    <div>
                      <div>{sug ? <Diff text={it.parsed.text} other={checkText(sug.checkId)} /> : it.parsed.text}</div>
                      {it.parsed.options.length > 0 && (
                        <div className="muted imp-opts">
                          {it.parsed.options.length} answer{it.parsed.options.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      {sug && (
                        <div className="imp-sug">
                          Close to an existing check ({pct(sug.score)}):{' '}
                          <span className="muted">
                            <Diff text={checkText(sug.checkId)} other={it.parsed.text} />
                          </span>
                        </div>
                      )}
                      {choice === 'replace' && (
                        <div className="imp-sug">
                          The existing check will read as this document does
                          {plan.group === 'SL0' && it.parsed.options.length > 0 ? ', with its answers' : ''}. The old wording is
                          kept so documents that still use it match.
                        </div>
                      )}
                    </div>
                    <div className="seg sm" role="group" aria-label="What to do with this check">
                      <button type="button" aria-pressed={choice === 'new'} onClick={() => onDecide(i, undefined)}>
                        Add as new
                      </button>
                      {sug && (
                        <button
                          type="button"
                          aria-pressed={choice === 'link'}
                          title="It is the existing check. Keep the check's wording and remember this wording for next time."
                          onClick={() => onDecide(i, { link: sug.checkId })}
                        >
                          Same check
                        </button>
                      )}
                      {sug && (
                        <button
                          type="button"
                          aria-pressed={choice === 'replace'}
                          title={`It is the existing check. Replace the check's wording${plan.group === 'SL0' ? ' and answers' : ''} with this document's.`}
                          onClick={() => onDecide(i, { replace: sug.checkId })}
                        >
                          Replace check
                        </button>
                      )}
                      <button type="button" aria-pressed={choice === 'skip'} onClick={() => onDecide(i, 'skip')}>
                        Skip
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tickItems.length > 0 && (
            <details className="imp-group">
              <summary>
                <b>Will be ticked for this document ({tickItems.length})</b>
              </summary>
              <ul className="imp-list">
                {tickItems.map(({ it, i }) => (
                  <li key={i}>
                    <span className="muted">{it.parsed.sectionName}: </span>
                    {it.parsed.text}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {t.missing.length > 0 && (
            <details className="imp-group">
              <summary>
                <b>Ticked today, but not in this document ({t.missing.length})</b>
              </summary>
              <label className="tick">
                <input type="checkbox" checked={untick} onChange={(e) => onUntick(e.target.checked)} /> Untick these for{' '}
                CPF-{plan.unit} {SLNAME(plan.level, levels)} when importing
              </label>
              <ul className="imp-list">
                {t.missing.map((id) => (
                  <li key={id}>{checkText(id)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </details>
  );
}
