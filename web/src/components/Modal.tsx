import { useStore } from '../store/useStore';
import AddCheckDialog from './dialogs/AddCheckDialog';
import DupWarnDialog from './dialogs/DupWarnDialog';
import ExportDialog from './dialogs/ExportDialog';
import AddSectionDialog from './dialogs/AddSectionDialog';
import AddUnitDialog from './dialogs/AddUnitDialog';

export default function Modal() {
  const modal = useStore((s) => s.modal);
  const closeModal = useStore((s) => s.closeModal);

  if (!modal) return null;

  return (
    <>
      <button className="x" onClick={closeModal} aria-label="Close">
        ×
      </button>
      {modal.kind === 'addCheck' && <AddCheckDialog sectionId={modal.sectionId} />}
      {modal.kind === 'dupWarn' && <DupWarnDialog payload={modal.payload} />}
      {modal.kind === 'export' && <ExportDialog />}
      {modal.kind === 'addSection' && <AddSectionDialog g={modal.g} />}
      {modal.kind === 'addUnit' && <AddUnitDialog />}
    </>
  );
}
