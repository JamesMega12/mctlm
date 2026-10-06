import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { groupLabel, SUGGEST_THRESHOLD } from '../../lib/constants';
import { getSection, suggestDocs } from '../../lib/derive';
import type { Group } from '../../types';

type AddType = 'check' | 'unit' | 'service level';

const ADD_TYPES: AddType[] = ['check', 'unit', 'service level'];

/** Add-new landing page. The "check" tab hands off to the same add-check
 * dialog the matrix's section "+" buttons open. "Unit" adds a real unit
 * (mirrors the inline control in the matrix's Units filter row — see
 * AddUnitDialog) starting with zero checks assigned. "Service level" adds a
 * real column to the matrix, in an existing group, or a new group (its own
 * matrix tab), for every unit. */
export default function AddView() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const units = useStore((s) => s.units);
  const levelMap = useStore((s) => s.levels);
  const addLevel = useStore((s) => s.addLevel);
  const openAddCheckDialog = useStore((s) => s.openAddCheckDialog);
  const addUnit = useStore((s) => s.addUnit);

  const [addType, setAddType] = useState<AddType>('check');

  const [pkGroup, setPkGroup] = useState<Group>('SL0');
  const [pkSection, setPkSection] = useState<number | null>(null);
  const sectionIds = sections.filter((s) => s.g === pkGroup).map((s) => s.id);
  const selectedSection = pkSection !== null && sectionIds.includes(pkSection) ? pkSection : (sectionIds[0] ?? 0);

  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [prefill, setPrefill] = useState(true);
  const NEW_GROUP = '__new__';
  const [levelGroup, setLevelGroup] = useState<string>('SL1/3/4');
  const [newGroupName, setNewGroupName] = useState('');

  const handleAddUnit = () => {
    const v = name.trim();
    if (!v) {
      setNameErr('Enter a unit name first.');
      return;
    }
    if (units.includes(v)) {
      setNameErr('That unit already exists.');
      return;
    }
    addUnit(v, prefill);
    setName('');
    setNameErr('');
  };

  const handleAddLevel = () => {
    const v = name.trim();
    if (!v) {
      setNameErr('Enter a service level name first.');
      return;
    }
    if (Object.values(levelMap).flat().some((l) => l.toLowerCase() === v.toLowerCase())) {
      setNameErr('That service level already exists.');
      return;
    }
    let target = levelGroup;
    if (levelGroup === NEW_GROUP) {
      target = newGroupName.trim();
      if (!target) {
        setNameErr('Enter a name for the new group.');
        return;
      }
      if (Object.keys(levelMap).some((g) => g.toLowerCase() === target.toLowerCase())) {
        setNameErr('That group already exists — pick it from the list instead.');
        return;
      }
    }
    addLevel(target, v);
    setName('');
    setNewGroupName('');
    setNameErr('');
  };

  return (
    <>
      <h2>Add new</h2>
      <p className="sub">New items are added straight to the master checklist.</p>

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
                {Object.keys(levelMap).map((grp) => (
                  <option value={grp} key={grp}>
                    {groupLabel(grp)}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>Section</span>
              <select value={selectedSection} onChange={(e) => setPkSection(Number(e.target.value))}>
                {sectionIds.map((sid) => (
                  <option value={sid} key={sid}>
                    {getSection(sections, sid)!.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="btn" disabled={!sectionIds.length} onClick={() => openAddCheckDialog(selectedSection)}>
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
                placeholder={addType === 'unit' ? 'e.g. CPF-880' : 'e.g. SL2'}
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
                <label className="tick">
                  <input type="checkbox" checked={prefill} onChange={(e) => setPrefill(e.target.checked)} /> Smart
                  suggestions: pre-fill checks that {SUGGEST_THRESHOLD * 100}% or more of the other units already have
                </label>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  {prefill
                    ? `Pre-fills ${suggestDocs(checks, units).length} document rows; untick any that don't apply from the matrix.`
                    : 'Starts with no checks assigned — tick the ones that apply from the matrix afterward.'}
                </p>
              </>
            ) : (
              <>
                <label className="fld">
                  <span>Belongs to</span>
                  <select value={levelGroup} onChange={(e) => setLevelGroup(e.target.value as Group)}>
                    {Object.keys(levelMap).map((grp) => (
                      <option value={grp} key={grp}>
                        {groupLabel(grp)}
                      </option>
                    ))}
                    <option value={NEW_GROUP}>New group…</option>
                  </select>
                </label>
                {levelGroup === NEW_GROUP && (
                  <label className="fld">
                    <span>New group name</span>
                    <input
                      type="text"
                      placeholder="e.g. SLX"
                      value={newGroupName}
                      onChange={(e) => {
                        setNewGroupName(e.target.value);
                        setNameErr('');
                      }}
                    />
                  </label>
                )}
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  The new level becomes a column for every unit, starting with no checks ticked. A new group becomes its own
                  tab in the matrix; add a section to it there, then tick checks in.
                </p>
              </>
            )}
            <div>
              <button className="btn" onClick={addType === 'unit' ? handleAddUnit : handleAddLevel}>
                Add {addType}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
