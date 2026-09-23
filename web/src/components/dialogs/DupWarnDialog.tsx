import { useStore } from '../../store/useStore';
import type { DupWarnPayload } from '../../store/useStore';
import { SLNAME } from '../../lib/constants';
import { getCheck, getSection } from '../../lib/derive';

export default function DupWarnDialog({ payload }: { payload: DupWarnPayload }) {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const commitNew = useStore((s) => s.commitNew);
  const closeModal = useStore((s) => s.closeModal);
  const openDrawer = useStore((s) => s.openDrawer);
  const backToAddForm = useStore((s) => s.backToAddForm);

  const match = getCheck(checks, payload.matchCheckId)!;
  const shownRows = match.rows
    .slice(0, 4)
    .map((r) => `CPF-${r.u} ${SLNAME(r.s)}`)
    .join(', ');
  const extra = match.rows.length > 4 ? ` +${match.rows.length - 4} more` : '';

  return (
    <>
      <h3 style={{ fontSize: 20, margin: '0 0 12px' }}>This check may already exist</h3>
      <p>
        {payload.exact
          ? 'A check with this exact wording is already in the master:'
          : `A ${Math.round(payload.matchScore * 100)}% similar check is already in the master:`}
      </p>
      <div className="warn">
        <b>{match.n}</b>
        <div className="muted" style={{ marginTop: 4 }}>
          {getSection(sections, match.s)!.name} &middot; in {shownRows}
          {extra}
        </div>
      </div>
      <p>Adding a duplicate makes the two drift apart in WorkRight. Add the existing check to more documents instead?</p>
      <div className="frow">
        <button
          className="btn"
          onClick={() => {
            closeModal();
            openDrawer(match.id);
          }}
        >
          Open the existing check
        </button>
        <button
          className="btn ghost"
          onClick={() =>
            commitNew(payload.sectionId, payload.pending.n, payload.pending.boxes, payload.pending.o, payload.pending.swi)
          }
        >
          Add mine anyway
        </button>
        <button className="btn ghost" onClick={() => backToAddForm(payload.sectionId)}>
          Back to the form
        </button>
      </div>
    </>
  );
}
