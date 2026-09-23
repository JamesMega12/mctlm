import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Nav from './components/Nav';
import Toast from './components/Toast';
import Modal from './components/Modal';
import Drawer from './components/Drawer';
import SectionDrawer from './components/SectionDrawer';
import Dashboard from './components/views/Dashboard';
import Matrix from './components/views/Matrix';
import AddView from './components/views/AddView';
import ReviewQueue from './components/views/ReviewQueue';

export default function App() {
  const view = useStore((s) => s.view);
  const drawerId = useStore((s) => s.drawerId);
  const sectionDrawerId = useStore((s) => s.sectionDrawerId);
  const modal = useStore((s) => s.modal);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const closeSectionDrawer = useStore((s) => s.closeSectionDrawer);
  const closeModal = useStore((s) => s.closeModal);

  const closeWhicheverDrawer = () => {
    if (drawerId !== null) closeDrawer();
    else closeSectionDrawer();
  };

  // Escape closes the modal if one is open, else whichever drawer (check or
  // section — they're mutually exclusive) is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modal) closeModal();
      else closeWhicheverDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, drawerId, sectionDrawerId, closeModal, closeDrawer, closeSectionDrawer]);

  return (
    <>
      <div className="app">
        <Nav />
        <main id="main">
          {view === 'dash' && <Dashboard />}
          {view === 'matrix' && <Matrix />}
          {view === 'add' && <AddView />}
          {view === 'review' && <ReviewQueue />}
        </main>
      </div>

      <div id="dr" className={drawerId !== null || sectionDrawerId !== null ? 'open' : ''}>
        <div className="drawer-bg" onClick={closeWhicheverDrawer} />
        <aside className="drawer" id="drawer" aria-label="Check detail">
          {drawerId !== null && <Drawer id={drawerId} />}
          {sectionDrawerId !== null && <SectionDrawer id={sectionDrawerId} />}
        </aside>
      </div>

      <div id="modal" className={modal ? 'open' : ''}>
        <div className="modal-bg" onClick={closeModal} />
        <div className="mbox wide" id="mbox" role="dialog" aria-modal="true">
          {modal && <Modal />}
        </div>
      </div>

      <Toast />
    </>
  );
}
