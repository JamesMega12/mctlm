import { useStore } from '../../store/useStore';
import { SLNAME } from '../../lib/constants';
import { counts, getCheck } from '../../lib/derive';

export default function Dashboard() {
  const checks = useStore((s) => s.checks);
  const mismatches = useStore((s) => s.mismatches);
  const units = useStore((s) => s.units);
  const setView = useStore((s) => s.setView);
  const openDrawer = useStore((s) => s.openDrawer);

  const k = counts(checks);

  const openDrift = mismatches.filter((m) => !m.done).slice(0, 5);

  return (
    <>
      <h2>Checklist health</h2>
      <p className="sub">
        Last WorkRight scrape ran Monday 14 Sep 2026, 06:00. {checks.length} checks across {units.length} unit
        {units.length !== 1 ? 's' : ''} and {units.length * 7} documents.
      </p>

      <div className="stats">
        <div className="panel stat">
          <b>{checks.length}</b>
          <span>Checks in master</span>
        </div>
        <div className="panel stat ok">
          <b>{k.s}</b>
          <span>Document rows in sync</span>
        </div>
        <div className="panel stat pend">
          <b>{k.p}</b>
          <span>Waiting for WorkRight entry</span>
        </div>
        <div className="panel stat drift">
          <b>{k.d}</b>
          <span>Differ from WorkRight</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Sync by unit</h3>
          {units.map((u) => {
            const a = [0, 0, 0];
            checks.forEach((c) =>
              c.rows.forEach((r) => {
                if (r.u === u) a[r.st === 'synced' ? 0 : r.st === 'pending' ? 1 : 2]++;
              }),
            );
            const t = a[0] + a[1] + a[2] || 1;
            return (
              <div className="bar" key={u}>
                <b>CPF-{u}</b>
                <div className="track">
                  <i style={{ width: `${(a[0] / t) * 100}%`, background: 'var(--ok)' }} />
                  <i style={{ width: `${Math.max((a[1] / t) * 100, a[1] ? 1.5 : 0)}%`, background: 'var(--pend)' }} />
                  <i style={{ width: `${Math.max((a[2] / t) * 100, a[2] ? 1.5 : 0)}%`, background: 'var(--drift)' }} />
                </div>
                <span className="muted">{t}</span>
              </div>
            );
          })}
          <div className="legend" style={{ marginTop: 12 }}>
            <span>
              <i className="dot synced" /> Synced
            </span>
            <span>
              <i className="dot pending" /> Pending
            </span>
            <span>
              <i className="dot drift" /> Drift
            </span>
          </div>
        </div>

        <div className="panel">
          <h3>Needs attention</h3>
          {openDrift.length ? (
            openDrift.map((m) => (
              <div className="log" key={m.id}>
                <div>
                  <span className="pill drift">Drift</span> CPF-{m.u} {SLNAME(m.s)} ·{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      openDrawer(m.check);
                    }}
                  >
                    {getCheck(checks, m.check)!.n.slice(0, 60)}…
                  </a>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No open drift.</p>
          )}
          <p style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setView('review')}>
              Open review queue
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
