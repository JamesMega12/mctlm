import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Nav from './components/Nav';
import Toast from './components/Toast';
import Modal from './components/Modal';
import Drawer from './components/Drawer';
import Dashboard from './components/views/Dashboard';
import Matrix from './components/views/Matrix';
import AddView from './components/views/AddView';
import ReviewQueue from './components/views/ReviewQueue';

export default function App() {
  const view = useStore((s) => s.view);
  const drawerId = useStore((s) => s.drawerId);
  const modal = useStore((s) => s.modal);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const closeModal = useStore((s) => s.closeModal);

  // Escape closes the modal if one is open, else the drawer — same precedence
  // as the original demo's single keydown listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modal) closeModal();
      else closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, closeModal, closeDrawer]);

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

      <div id="dr" className={drawerId !== null ? 'open' : ''}>
        <div className="drawer-bg" onClick={closeDrawer} />
        <aside className="drawer" id="drawer" aria-label="Check detail">
          {drawerId !== null && <Drawer id={drawerId} />}
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
