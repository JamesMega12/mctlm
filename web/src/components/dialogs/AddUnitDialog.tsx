import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { SUGGEST_THRESHOLD } from '../../lib/constants';
import { suggestDocs } from '../../lib/derive';

/** Add-unit form. A new unit starts with zero checks assigned in any
 * document — the user ticks the ones that apply straight from the matrix
 * grid (or the drawer) afterward. */
export default function AddUnitDialog() {
  const units = useStore((s) => s.units);
  const checks = useStore((s) => s.checks);
  const addUnit = useStore((s) => s.addUnit);
  const closeModal = useStore((s) => s.closeModal);

  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [prefill, setPrefill] = useState(true);
  const suggested = suggestDocs(checks, units).length;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameErr('Enter a unit name first.');
      return;
    }
    if (units.includes(trimmed)) {
      setNameErr('That unit already exists.');
      return;
    }
    addUnit(trimmed, prefill);
    closeModal();
  };

  return (
    <>
      <h3 style={{ fontSize: 20, margin: '0 0 12px' }}>Add a unit</h3>
      <div className="form">
        <label className="fld">
          <span>Unit name</span>
          <input
            type="text"
            placeholder="e.g. 880"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameErr('');
            }}
            autoFocus
          />
          <span className="err">{nameErr}</span>
        </label>
        <label className="tick">
          <input type="checkbox" checked={prefill} onChange={(e) => setPrefill(e.target.checked)} /> Smart suggestions:
          pre-fill checks that {SUGGEST_THRESHOLD * 100}% or more of the other units already have
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Displayed as CPF-{name.trim() || '…'}.{' '}
          {prefill
            ? `Pre-fills ${suggested} document rows; untick any that don't apply from the matrix.`
            : 'Starts with no checks assigned — tick the ones that apply from the matrix afterward.'}
        </p>
        <div className="frow">
          <button className="btn" onClick={handleSave}>
            Add unit
          </button>
          <button className="btn ghost" onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
