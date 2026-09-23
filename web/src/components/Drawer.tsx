import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { GROUPS, SLNAME } from '../lib/constants';
import { getCheck, getSection, status } from '../lib/derive';
import { sim } from '../lib/text';
import type { Option } from '../types';

/** The check detail drawer, in view or edit mode. Ported from the original's
 * drawD(): answers, the where-it's-used tick grid, impact, look-alike checks
 * (Jaccard > 0.55) and history. */
export default function Drawer({ id }: { id: number }) {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const mismatches = useStore((s) => s.mismatches);
  const units = useStore((s) => s.units);
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const openDrawer = useStore((s) => s.openDrawer);
  const saveEdit = useStore((s) => s.saveEdit);
  const toggleUse = useStore((s) => s.toggleUse);
  const pushToast = useStore((s) => s.pushToast);

  const c = getCheck(checks, id)!;
  const st = status(c);
  const sl = GROUPS[c.g];
  const section = getSection(sections, c.s)!;

  const [formN, setFormN] = useState(c.n);
  const [formC, setFormC] = useState(c.c || '');
  const [formSwi, setFormSwi] = useState(c.swi);
  const [formOpts, setFormOpts] = useState<Option[]>(c.o);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Re-seed the edit form from the live check every time it changes — matches
  // the original, which rebuilt the whole drawer (including the edit form)
  // from `c` on every drawD(id) call, e.g. after toggling a document box.
  useEffect(() => {
    setFormN(c.n);
    setFormC(c.c || '');
    setFormSwi(c.swi);
    setFormOpts(c.o);
  }, [c]);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
    else closeBtnRef.current?.focus();
  }, [editing, id]);

  const have = units.filter((u) => c.rows.some((r) => r.u === u));
  const missing = units.filter((u) => !have.includes(u));

  const looks = checks
    .filter((x) => x.id !== id && x.g === c.g)
    .map((x) => [x, sim(c.n, x.n)] as const)
    .filter(([, v]) => v > 0.55)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const updateOption = (i: number, patch: Partial<Option>) =>
    setFormOpts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeOption = (i: number) => setFormOpts((prev) => prev.filter((_, idx) => idx !== i));
  const addOption = () => setFormOpts((prev) => [...prev, { t: '', bad: true }]);

  const handleSaveClick = () => {
    const wording = formN.trim();
    if (!wording) {
      pushToast('Check wording cannot be empty.');
      nameRef.current?.focus();
      return;
    }
    const cleanOptions = formOpts.filter((o) => o.t.trim()).map((o) => ({ t: o.t.trim(), bad: o.bad }));
    saveEdit(id, { n: wording, c: formC.trim(), swi: formSwi, o: cleanOptions });
  };

  return (
    <>
      <button className="x" onClick={closeDrawer} aria-label="Close" ref={closeBtnRef}>
        ×
      </button>

      {editing ? (
        <div className="panel">
          <span className={`pill ${st}`}>{st[0].toUpperCase() + st.slice(1)}</span>
          <label className="fld">
            <span>Check wording</span>
            <textarea rows={3} ref={nameRef} value={formN} onChange={(e) => setFormN(e.target.value)} />
          </label>
          <label className="fld">
            <span>Comments</span>
            <input type="text" value={formC} onChange={(e) => setFormC(e.target.value)} />
          </label>
          <label className="tick">
            <input type="checkbox" checked={formSwi} onChange={(e) => setFormSwi(e.target.checked)} /> SWI needed
          </label>
          <div className="meta">
            <span>{section.name}</span>
            {section.wo && section.wo !== 'SL0' && <span>{section.wo}</span>}
            <span>WorkRight {c.wr}</span>
          </div>
          <div className="frow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={handleSaveClick}>
              Save changes
            </button>
            <button className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Saved edits become pending until the scrape finds them in WorkRight.
            </span>
          </div>
        </div>
      ) : (
        <div className="panel">
          <span className={`pill ${st}`}>{st[0].toUpperCase() + st.slice(1)}</span>
          <button className="btn ghost sm" style={{ float: 'right' }} onClick={() => setEditing(true)}>
            Edit
          </button>
          <h3 style={{ margin: '10px 0 0', fontSize: 22 }}>{c.n}</h3>
          <div className="meta">
            <span>{section.name}</span>
            {section.wo && section.wo !== 'SL0' && <span>{section.wo}</span>}
            <span>WorkRight {c.wr}</span>
            <span>SWI {c.swi ? 'needed' : 'not needed'}</span>
          </div>
          {c.c && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
              {c.c}
            </p>
          )}
        </div>
      )}

      <details className="panel" open>
        <summary>
          <h3>Answers</h3>
        </summary>
        {editing ? (
          <>
            <div>
              {formOpts.map((o, i) => (
                <div className="oline" key={i}>
                  <input
                    type="text"
                    value={o.t}
                    aria-label={`Answer ${i + 1}`}
                    onChange={(e) => updateOption(i, { t: e.target.value })}
                  />
                  <div className="seg sm" role="group" aria-label="Answer type">
                    <button type="button" aria-pressed={!o.bad} onClick={() => updateOption(i, { bad: false })}>
                      Good
                    </button>
                    <button type="button" aria-pressed={!!o.bad} onClick={() => updateOption(i, { bad: true })}>
                      Defect
                    </button>
                  </div>
                  <button className="del" type="button" aria-label="Remove answer" onClick={() => removeOption(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className="btn ghost sm" onClick={addOption}>
              Add answer
            </button>
          </>
        ) : c.o.length ? (
          <table className="opt">
            <tbody>
              {c.o.map((o, i) => {
                const mm = mismatches.find((m) => m.check === id && m.opt === i && !m.done);
                return (
                  <tr key={i}>
                    <td style={{ width: 24 }}>{i + 1}</td>
                    <td>
                      <span className={`ans ${o.bad ? 'bad' : 'good'}`}>
                        <i />
                        {o.t}
                      </span>{' '}
                      {mm && <span className="pill drift">Drift</span>}
                    </td>
                    <td style={{ width: 70, textAlign: 'right' }} className="muted">
                      {o.bad ? 'Defect' : 'Good'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">
            No answer options in the source{c.g === 'SL0' ? '' : ' — the ACP export has none for SL1, 3 and 4 tasks'}.
          </p>
        )}
      </details>

      <div className="panel">
        <h3>Where it's used</h3>
        <table className="use">
          <thead>
            <tr>
              <th></th>
              {sl.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u}>
                <td>CPF-{u}</td>
                {sl.map((x) => {
                  const r = c.rows.find((row) => row.u === u && row.s === x);
                  return (
                    <td key={x}>
                      <button
                        className={`tick2 ${r ? r.st : 'off'}`}
                        onClick={() => toggleUse(id, u, x)}
                        aria-pressed={!!r}
                        title={r ? `In CPF-${u} ${SLNAME(x)} (${r.st}) — click to remove` : 'Not used — click to add'}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
          Click a box to tick or untick. Ticking adds the check to that document as pending; unticking removes it.
        </p>
      </div>

      <details className="panel" open>
        <summary>
          <h3>Impact</h3>
        </summary>
        <p>
          Changing this check touches{' '}
          <b>
            {c.rows.length} document{c.rows.length !== 1 ? 's' : ''}
          </b>{' '}
          across{' '}
          <b>
            {have.length} unit{have.length !== 1 ? 's' : ''}
          </b>
          .
        </p>
        <ul className="impact">
          {have.map((u) => (
            <li key={u}>
              CPF-{u}:{' '}
              {c.rows
                .filter((r) => r.u === u)
                .map((r) => SLNAME(r.s))
                .sort()
                .join(', ')}
            </li>
          ))}
        </ul>
        {missing.length > 0 && (
          <p className="muted">Not used by {missing.map((u) => 'CPF-' + u).join(', ')}. Check whether that is intended.</p>
        )}
      </details>

      {looks.length > 0 && (
        <details className="panel">
          <summary>
            <h3>Look-alike checks ({looks.length})</h3>
          </summary>
          {looks.map(([x, v]) => (
            <div className="log" key={x.id}>
              <div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openDrawer(x.id);
                  }}
                >
                  {x.n}
                </a>{' '}
                <span className="muted">{Math.round(v * 100)}% word overlap</span>
              </div>
            </div>
          ))}
        </details>
      )}

      <details className="panel">
        <summary>
          <h3>History ({c.history.length})</h3>
        </summary>
        <div className="log">
          {c.history
            .slice()
            .reverse()
            .map((h, i) => (
              <div key={i}>
                <b>{h.t}</b> · {h.who} · {h.what}
              </div>
            ))}
        </div>
      </details>
    </>
  );
}
