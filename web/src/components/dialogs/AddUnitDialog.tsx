import { useState } from 'react';
import { useStore } from '../../store/useStore';

/** Add-unit form. A new unit starts with zero checks assigned in any
 * document — the user ticks the ones that apply straight from the matrix
 * grid (or the drawer) afterward. */
export default function AddUnitDialog() {
  const units = useStore((s) => s.units);
  const addUnit = useStore((s) => s.addUnit);
  const closeModal = useStore((s) => s.closeModal);

  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');

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
    addUnit(trimmed);
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
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Displayed as CPF-{name.trim() || '…'}. Starts with no checks assigned — tick the ones that apply straight
          from the matrix afterward.
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
