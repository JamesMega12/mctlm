import { useStore } from '../store/useStore';
import type { View } from '../types';

export default function Nav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
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
      <div className="foot">Local demo · data from InTouch ACP rev 18 export.</div>
    </nav>
  );
}
