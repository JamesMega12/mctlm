import { SLNAME } from '../lib/constants';
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
export default function ImportDocCard({ plan, tally: t, decisions, untick, checks, levels, defaultOpen, onDecide, onUntick, onRemove }: Props) {
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

      {plan.blockers.map((b) => (
        <p className="err" key={b}>
          {b}
        </p>
      ))}
      {plan.doc.warnings.length > 0 && (
        <div className="warn">
          <b>The reader flagged {plan.doc.warnings.length} thing{plan.doc.warnings.length !== 1 ? 's' : ''} in this file:</b>
          <ul>
            {plan.doc.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {(plan.createsUnit || plan.createsLevel) && !blocked && (
        <p className="warn">
          {plan.createsUnit && <>CPF-{plan.unit} isn't in the checklist yet; importing adds it as a new unit. </>}
          {plan.createsLevel && <>"{plan.level}" isn't a service level yet; importing adds it to {plan.group}.</>}
        </p>
      )}

      {!blocked && (
        <>
          <p className="muted imp-note">
            {t.unchanged} already match and are ticked.
            {elsewhere > 0 && ` ${elsewhere} matched by wording but sit under a different section in the checklist (kept there).`}
            {answersDiffer > 0 && ` ${answersDiffer} have different answer lists than the checklist (the checklist's are kept).`}
          </p>

          {newItems.length > 0 && (
            <div className="imp-group">
              <h4>Not in the checklist yet ({newItems.length})</h4>
              {newItems.map(({ it, i }) => {
                const d = decisions[i];
                const sug = it.suggestion;
                const choice = d === 'skip' ? 'skip' : typeof d === 'object' ? 'link' : 'new';
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
                    </div>
                    <div className="seg sm" role="group" aria-label="What to do with this check">
                      <button type="button" aria-pressed={choice === 'new'} onClick={() => onDecide(i, undefined)}>
                        Add as new
                      </button>
                      {sug && (
                        <button type="button" aria-pressed={choice === 'link'} onClick={() => onDecide(i, { link: sug.checkId })}>
                          Same check
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
