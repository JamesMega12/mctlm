import { useStore } from '../store/useStore';
import { pendList } from '../lib/derive';
import type { View } from '../types';

export default function Nav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const checks = useStore((s) => s.checks);
  const mismatches = useStore((s) => s.mismatches);

  const reviewCount = mismatches.filter((m) => !m.done).length + pendList(checks).length;

  const current = (v: View) => (view === v ? 'true' : undefined);

  return (
    <nav aria-label="Main">
      <h1>
        CPF Master Checklist
        <small>TLM · demo build</small>
      </h1>
      <button aria-current={current('dash')} onClick={() => setView('dash')}>
        Dashboard
      </button>
      <button aria-current={current('matrix')} onClick={() => setView('matrix')}>
        Matrix view
      </button>
      <button aria-current={current('add')} onClick={() => setView('add')}>
        Add new
      </button>
      <button aria-current={current('review')} onClick={() => setView('review')}>
        Review queue <span className="badge">{reviewCount}</span>
      </button>
      <div className="foot">Local demo · data from InTouch ACP rev 18 export. Sync statuses are simulated.</div>
    </nav>
  );
}
