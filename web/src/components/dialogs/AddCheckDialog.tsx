import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { GROUPS, SLNAME, UNITS } from '../../lib/constants';
import { sim } from '../../lib/text';
import type { Option, ServiceLevel, Unit } from '../../types';

const DEFAULT_SL0_OPTIONS: Option[] = [
  { t: 'Good condition', bad: false },
  { t: 'Damaged', bad: true },
  { t: 'Other defect—add deficiency note or photo, or both', bad: true },
];

const docKey = (u: Unit, s: ServiceLevel) => `${u}|${s}`;

/** Add-check form. Warns about look-alike checks as you type (Jaccard > 0.5)
 * and, on save, re-checks for a near-duplicate before committing — see
 * DupWarnDialog for what happens when one is found. */
export default function AddCheckDialog({ sectionId }: { sectionId: number }) {
  const sections = useStore((s) => s.sections);
  const checks = useStore((s) => s.checks);
  const commitNew = useStore((s) => s.commitNew);
  const openDupWarnDialog = useStore((s) => s.openDupWarnDialog);
  const closeModal = useStore((s) => s.closeModal);
  const openDrawer = useStore((s) => s.openDrawer);

  const section = sections[sectionId];
  const group = section.wo === 'SL0' ? 'SL0' : 'SL1/3/4';
  const levels = GROUPS[group];

  const [n, setN] = useState('');
  const [options, setOptions] = useState<Option[]>(group === 'SL0' ? DEFAULT_SL0_OPTIONS : []);
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [swi, setSwi] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [docsErr, setDocsErr] = useState('');

  const dupHits = useMemo(() => {
    if (n.trim().length < 10) return [];
    return checks
      .map((c) => [c, sim(n, c.n)] as const)
      .filter(([, score]) => score > 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [n, checks]);

  const toggleDoc = (u: Unit, s: ServiceLevel) => {
    setDocs((prev) => {
      const next = new Set(prev);
      const k = docKey(u, s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const updateOption = (i: number, patch: Partial<Option>) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const addOption = () => setOptions((prev) => [...prev, { t: '', bad: true }]);

  const handleSave = () => {
    const wording = n.trim();
    const boxes = [...docs].map((k) => {
      const [u, s] = k.split('|') as [Unit, ServiceLevel];
      return { u, s };
    });
    const cleanOptions = options.filter((o) => o.t.trim()).map((o) => ({ t: o.t.trim(), bad: o.bad }));

    let ok = true;
    setNameErr('');
    setDocsErr('');
    if (!wording) {
      setNameErr('Enter the check wording first.');
      ok = false;
    }
    if (!boxes.length) {
      setDocsErr('Pick at least one document.');
      ok = false;
    }
    if (!ok) return;

    const dupe = checks
      .map((c) => [c, sim(wording, c.n)] as const)
      .filter(([, score]) => score > 0.5)
      .sort((a, b) => b[1] - a[1])[0];

    if (dupe) {
      const [match, score] = dupe;
      openDupWarnDialog({
        sectionId,
        pending: { n: wording, boxes, o: cleanOptions, swi },
        matchCheckId: match.id,
        matchScore: score,
        exact: match.n.trim().toLowerCase() === wording.toLowerCase(),
      });
      return;
    }
    commitNew(sectionId, wording, boxes, cleanOptions, swi);
  };

  return (
    <>
      <h3 style={{ fontSize: 20, margin: '0 0 12px' }}>Add a check to {section.name}</h3>
      <div className="form">
        <label className="fld">
          <span>Check wording</span>
          <textarea
            rows={3}
            placeholder="e.g. Suction hose and fittings"
            value={n}
            onChange={(e) => {
              setN(e.target.value);
              setNameErr('');
            }}
            autoFocus
          />
          <span className="err">{nameErr}</span>
        </label>

        {dupHits.length > 0 && (
          <div className="warn">
            <b>Similar checks already exist.</b> Adding one of these to more documents may be better than creating a
            new check.
            {dupHits.map(([c, score]) => (
              <div key={c.id} style={{ marginTop: 4 }}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    closeModal();
                    openDrawer(c.id);
                  }}
                >
                  {c.n}
                </a>{' '}
                <span className="muted">
                  {Math.round(score * 100)}% overlap · {c.rows.length} documents
                </span>
              </div>
            ))}
          </div>
        )}

        {group === 'SL0' && (
          <div>
            <b>Answers</b>
            <div>
              {options.map((o, i) => (
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
            <button className="btn ghost sm" type="button" onClick={addOption}>
              Add answer
            </button>
          </div>
        )}

        <div>
          <b>Put it in these documents</b>
          <div style={{ overflow: 'auto' }}>
            <table className="assign">
              <tbody>
                <tr>
                  <th></th>
                  {levels.map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
                {UNITS.map((u) => (
                  <tr key={u}>
                    <td>CPF-{u}</td>
                    {levels.map((x) => (
                      <td key={x}>
                        <input
                          type="checkbox"
                          aria-label={`CPF-${u} ${SLNAME(x)}`}
                          checked={docs.has(docKey(u, x))}
                          onChange={() => toggleDoc(u, x)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="err">{docsErr}</span>
        </div>

        <label className="tick">
          <input type="checkbox" checked={swi} onChange={(e) => setSwi(e.target.checked)} /> SWI needed
        </label>

        <div className="frow">
          <button className="btn" onClick={handleSave}>
            Add check
          </button>
          <button className="btn ghost" onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
