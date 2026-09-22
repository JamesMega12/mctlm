import { useStore } from '../../store/useStore';
import { SLNAME } from '../../lib/constants';
import { pendList } from '../../lib/derive';

export default function ReviewQueue() {
  const checks = useStore((s) => s.checks);
  const mismatches = useStore((s) => s.mismatches);
  const openDrawer = useStore((s) => s.openDrawer);
  const resolve = useStore((s) => s.resolve);
  const simSync = useStore((s) => s.simSync);

  const open = mismatches.filter((m) => !m.done);
  const pend = pendList(checks);
  const closed = mismatches.filter((m) => m.done);

  return (
    <>
      <h2>Review queue</h2>
      <p className="sub">
        Drift is where WorkRight no longer matches the master. Pending items were added or edited here and still need
        entering in WorkRight. Any TLM user can resolve these.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Drift from last scrape ({open.length})</h3>
        {open.length ? (
          open.map((m) => {
            const c = checks[m.check];
            return (
              <div className="rq" key={m.id}>
                <span className="pill drift">Drift</span>
                <div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      openDrawer(c.id);
                    }}
                  >
                    <b>{c.n}</b>
                  </a>
                  <div className="muted" style={{ fontSize: 14 }}>
                    CPF-{m.u} {SLNAME(m.s)} · {m.type}
                    {m.opt !== null ? ' · answer ' + (m.opt + 1) : ''}
                  </div>
                  <div className="diff">
                    <em>Master</em>
                    <span>{m.app}</span>
                    <em>WorkRight</em>
                    <span>{m.wr}</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <button className="btn" onClick={() => resolve(m.id, 'Keep master, fix WorkRight')}>
                    Keep master
                  </button>
                  <button className="btn ghost" onClick={() => resolve(m.id, 'Marked as fixed in WorkRight')}>
                    Fixed in WorkRight
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="muted">No open drift.</p>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Waiting for WorkRight entry ({pend.length})</h3>
        {pend.length ? (
          pend.slice(0, 60).map(({ c, r }) => (
            <div className="rq" key={`${c.id}-${r.u}-${r.s}`}>
              <span className="pill pending">Pending</span>
              <div>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openDrawer(c.id);
                  }}
                >
                  <b>{c.n}</b>
                </a>
                <div className="muted" style={{ fontSize: 14 }}>
                  CPF-{r.u} {SLNAME(r.s)}
                </div>
              </div>
              <button
                className="btn ghost"
                onClick={() => simSync(c.id, r.u, r.s)}
                title="Demo only: pretend the weekly scrape found it"
              >
                Simulate scrape
              </button>
            </div>
          ))
        ) : (
          <p className="muted">Nothing waiting.</p>
        )}
        {pend.length > 60 && (
          <p className="muted" style={{ marginTop: 10 }}>
            +{pend.length - 60} more.
          </p>
        )}
      </div>

      {closed.length > 0 && (
        <div className="panel">
          <h3>Resolved</h3>
          <div className="log">
            {closed.map((m) => (
              <div key={m.id}>
                {checks[m.check].n.slice(0, 70)}… · CPF-{m.u} {SLNAME(m.s)} · {m.done}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
