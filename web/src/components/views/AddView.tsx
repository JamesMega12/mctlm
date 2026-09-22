import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { UNITS } from '../../lib/constants';
import type { Group } from '../../types';

type AddType = 'check' | 'unit' | 'service level';

const ADD_TYPES: AddType[] = ['check', 'unit', 'service level'];

/** Add-new landing page. The "check" tab hands off to the same add-check
 * dialog the matrix's section "+" buttons open. Unit and service level are
 * stubs in this demo — same as the original, saveSimple() just toasts and
 * doesn't persist anything. */
export default function AddView() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const openAddCheckDialog = useStore((s) => s.openAddCheckDialog);
  const pushToast = useStore((s) => s.pushToast);

  const [addType, setAddType] = useState<AddType>('check');

  const [pkGroup, setPkGroup] = useState<Group>('SL0');
  const [pkSection, setPkSection] = useState<number | null>(null);
  const sectionIds = [...new Set(checks.filter((c) => c.g === pkGroup).map((c) => c.s))];
  const selectedSection = pkSection !== null && sectionIds.includes(pkSection) ? pkSection : (sectionIds[0] ?? 0);

  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [copyFrom, setCopyFrom] = useState('');

  const handleSaveSimple = () => {
    const v = name.trim();
    if (!v) {
      setNameErr('Enter a name first.');
      return;
    }
    pushToast(`${v} added. In the full app it appears as a new column in the matrix.`);
    setName('');
    setNameErr('');
  };

  return (
    <>
      <h2>Add new</h2>
      <p className="sub">New items are saved as pending. The weekly scrape marks them synced once they appear in WorkRight.</p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="What to add">
          {ADD_TYPES.map((t) => (
            <button key={t} aria-pressed={addType === t} onClick={() => setAddType(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {addType === 'check' ? (
          <div className="form">
            <label className="fld">
              <span>Which section?</span>
              <select
                value={pkGroup}
                onChange={(e) => {
                  setPkGroup(e.target.value as Group);
                  setPkSection(null);
                }}
              >
                <option value="SL0">SL0 check</option>
                <option value="SL1/3/4">SL1, 3 &amp; 4 task</option>
              </select>
            </label>
            <label className="fld">
              <span>Section</span>
              <select value={selectedSection} onChange={(e) => setPkSection(Number(e.target.value))}>
                {sectionIds.map((sid) => (
                  <option value={sid} key={sid}>
                    {sections[sid].name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="btn" onClick={() => openAddCheckDialog(selectedSection)}>
                Continue
              </button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              You can also add a check straight from the matrix: use the + on any section heading.
            </p>
          </div>
        ) : (
          <div className="form">
            <label className="fld">
              <span>{addType === 'unit' ? 'Unit name' : 'Service level name'}</span>
              <input
                type="text"
                placeholder={addType === 'unit' ? 'e.g. CPF-880' : 'e.g. SL2 (375 hours)'}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameErr('');
                }}
              />
              <span className="err">{nameErr}</span>
            </label>
            {addType === 'unit' ? (
              <>
                <label className="fld">
                  <span>Copy checks from</span>
                  <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                    <option value="">Start empty</option>
                    {UNITS.map((u) => (
                      <option key={u}>CPF-{u}</option>
                    ))}
                  </select>
                </label>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  Copying creates pending rows for every check the source unit uses, so you can review before entering
                  them in WorkRight.
                </p>
              </>
            ) : (
              <>
                <label className="fld">
                  <span>Belongs to</span>
                  <select>
                    <option>New group</option>
                    <option>SL0</option>
                  </select>
                </label>
                <label className="fld">
                  <span>Interval</span>
                  <input type="text" placeholder="e.g. 375 hours" />
                </label>
              </>
            )}
            <div>
              <button className="btn" onClick={handleSaveSimple}>
                Add {addType}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
