import { useStore } from '../../store/useStore';
import { allLevels as flattenLevels, SLNAME } from '../../lib/constants';

export default function Dashboard() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const units = useStore((s) => s.units);
  const levelMap = useStore((s) => s.levels);
  const setView = useStore((s) => s.setView);

  const allLevels = flattenLevels(levelMap);
  const docCount = units.length * allLevels.length;
  const rowCount = checks.reduce((n, c) => n + c.rows.length, 0);

  return (
    <>
      <h2>Checklist overview</h2>
      <p className="sub">
        {checks.length} checks across {units.length} unit{units.length !== 1 ? 's' : ''} and {docCount} documents.
      </p>

      <div className="stats">
        <div className="panel stat">
          <b>{checks.length}</b>
          <span>Checks in master</span>
        </div>
        <div className="panel stat">
          <b>{sections.length}</b>
          <span>Sections</span>
        </div>
        <div className="panel stat">
          <b>{units.length}</b>
          <span>Units</span>
        </div>
        <div className="panel stat">
          <b>{rowCount}</b>
          <span>Document rows ticked</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Checks by unit</h3>
          {units.map((u) => {
            const n = checks.filter((c) => c.rows.some((r) => r.u === u)).length;
            return (
              <div className="bar" key={u}>
                <b>CPF-{u}</b>
                <div className="track">
                  <i style={{ width: `${(n / (checks.length || 1)) * 100}%`, background: 'var(--steel)' }} />
                </div>
                <span className="muted">{n}</span>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <h3>Checks by service level</h3>
          {allLevels.map((s) => (
            <div className="bar" key={s}>
              <b>{SLNAME(s, levelMap)}</b>
              <div className="track">
                <i
                  style={{
                    width: `${(checks.filter((c) => c.rows.some((r) => r.s === s)).length / (checks.length || 1)) * 100}%`,
                    background: 'var(--steel)',
                  }}
                />
              </div>
              <span className="muted">{checks.filter((c) => c.rows.some((r) => r.s === s)).length}</span>
            </div>
          ))}
          <p style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setView('matrix')}>
              Open matrix view
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
