import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Group } from '../../types';

/** Add-section form. SL0 sections don't need a WO label (always fixed to
 * "SL0"); SL1/3/4 sections take a free-text WO group name. */
export default function AddSectionDialog({ g }: { g: Group }) {
  const addSection = useStore((s) => s.addSection);
  const closeModal = useStore((s) => s.closeModal);
  const openSectionDrawer = useStore((s) => s.openSectionDrawer);

  const [name, setName] = useState('');
  const [wo, setWo] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [woErr, setWoErr] = useState('');

  const isSL0 = g === 'SL0';

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedWo = wo.trim();
    let ok = true;
    setNameErr('');
    setWoErr('');
    if (!trimmedName) {
      setNameErr('Enter a section name first.');
      ok = false;
    }
    if (!isSL0 && !trimmedWo) {
      setWoErr('Enter a WO group label first.');
      ok = false;
    }
    if (!ok) return;

    const newId = addSection(g, trimmedName, trimmedWo);
    closeModal();
    openSectionDrawer(newId);
  };

  return (
    <>
      <h3 style={{ fontSize: 20, margin: '0 0 12px' }}>
        Add a section to {isSL0 ? 'SL0 checks' : 'SL1, 3 & 4 tasks'}
      </h3>
      <div className="form">
        <label className="fld">
          <span>Section name</span>
          <input
            type="text"
            placeholder="e.g. Braking System"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameErr('');
            }}
            autoFocus
          />
          <span className="err">{nameErr}</span>
        </label>
        {!isSL0 && (
          <label className="fld">
            <span>WO group</span>
            <input
              type="text"
              placeholder="e.g. WO #6: New group"
              value={wo}
              onChange={(e) => {
                setWo(e.target.value);
                setWoErr('');
              }}
            />
            <span className="err">{woErr}</span>
          </label>
        )}
        <div className="frow">
          <button className="btn" onClick={handleSave}>
            Add section
          </button>
          <button className="btn ghost" onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
