import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { getSection, status } from '../lib/derive';

/** Section detail drawer: view/rename the section, list every check in it
 * (with a link to that check's own drawer), add a check to it, and remove
 * the section — which cascade-deletes its checks, so removal is a two-step
 * confirm rather than a single destructive click. */
export default function SectionDrawer({ id }: { id: number }) {
  const sections = useStore((s) => s.sections);
  const checks = useStore((s) => s.checks);
  const closeSectionDrawer = useStore((s) => s.closeSectionDrawer);
  const openDrawer = useStore((s) => s.openDrawer);
  const openAddCheckDialog = useStore((s) => s.openAddCheckDialog);
  const updateSection = useStore((s) => s.updateSection);
  const removeSection = useStore((s) => s.removeSection);

  const section = getSection(sections, id)!;
  const sectionChecks = checks.filter((c) => c.s === id);
  const isSL0 = section.wo === 'SL0';

  const [name, setName] = useState(section.name);
  const [wo, setWo] = useState(section.wo);
  const [nameErr, setNameErr] = useState('');
  const [armed, setArmed] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Re-seed from the live section — mirrors Drawer's same pattern for the
  // check edit form, so an external change (or switching sections) always
  // shows current values.
  useEffect(() => {
    setName(section.name);
    setWo(section.wo);
    setArmed(false);
  }, [section]);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, [id]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameErr('Section name cannot be empty.');
      return;
    }
    setNameErr('');
    updateSection(id, { name: trimmed, wo: isSL0 ? undefined : wo.trim() || section.wo });
  };

  const handleRemoveClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    removeSection(id);
  };

  return (
    <>
      <button className="x" onClick={closeSectionDrawer} aria-label="Close" ref={closeBtnRef}>
        ×
      </button>

      <div className="panel">
        <label className="fld">
          <span>Section name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameErr('');
            }}
          />
          <span className="err">{nameErr}</span>
        </label>
        {!isSL0 && (
          <label className="fld">
            <span>WO group</span>
            <input type="text" value={wo} onChange={(e) => setWo(e.target.value)} />
          </label>
        )}
        <div className="frow" style={{ marginTop: 12 }}>
          <button className="btn" onClick={handleSave}>
            Save changes
          </button>
          <button className="btn ghost" onClick={() => openAddCheckDialog(id)}>
            Add a check here
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Checks in this section ({sectionChecks.length})</h3>
        {sectionChecks.length ? (
          <div className="log">
            {sectionChecks.map((c) => {
              const st = status(c);
              return (
                <div key={c.id}>
                  <span className={`pill ${st}`}>{st[0].toUpperCase() + st.slice(1)}</span>{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      openDrawer(c.id);
                    }}
                  >
                    {c.n}
                  </a>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No checks in this section yet.</p>
        )}
      </div>

      <div className="panel">
        <h3>Remove section</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          Removing this section also deletes every check in it — {sectionChecks.length} check
          {sectionChecks.length !== 1 ? 's' : ''}. This can't be undone.
        </p>
        <div className="frow">
          <button
            className="btn ghost"
            style={{ borderColor: 'var(--drift)', color: 'var(--drift)' }}
            onClick={handleRemoveClick}
          >
            {armed
              ? `Really remove? Click again to delete ${sectionChecks.length} check${sectionChecks.length !== 1 ? 's' : ''}`
              : 'Remove section'}
          </button>
          {armed && (
            <button className="btn ghost" onClick={() => setArmed(false)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
