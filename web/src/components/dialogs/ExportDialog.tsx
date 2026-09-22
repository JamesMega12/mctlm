import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { GROUPS, UNITS } from '../../lib/constants';
import { exportPdf, type PdfError } from '../../lib/pdf';
import type { ServiceLevel, Unit } from '../../types';

export default function ExportDialog() {
  const expU = useStore((s) => s.expU) ?? UNITS;
  const expL = useStore((s) => s.expL) ?? GROUPS.SL0;
  const expGrp = useStore((s) => s.expGrp);
  const expAns = useStore((s) => s.expAns);
  const toggleExportUnit = useStore((s) => s.toggleExportUnit);
  const toggleExportLevel = useStore((s) => s.toggleExportLevel);
  const setExportGroupOrder = useStore((s) => s.setExportGroupOrder);
  const setExportIncludeAnswers = useStore((s) => s.setExportIncludeAnswers);
  const closeModal = useStore((s) => s.closeModal);
  const pushToast = useStore((s) => s.pushToast);

  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const mg = useStore((s) => s.mg);
  const q = useStore((s) => s.q);
  const fsec = useStore((s) => s.fsec);
  const fst = useStore((s) => s.fst);

  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState('');

  const docsN = expU.length * expL.length;

  const handleExport = async () => {
    setErr('');
    setBuilding(true);
    try {
      const result = await exportPdf({
        checks,
        sections,
        expU,
        expL,
        expGrp,
        expAns,
        filters: { mg, q, fsec, fst },
      });
      closeModal();
      pushToast(`PDF saved · ${result.pairs} document${result.pairs > 1 ? 's' : ''}.`);
    } catch (e) {
      const pdfErr = e as PdfError;
      if (pdfErr?.code === 'declined') {
        // user cancelled the save prompt — nothing to report
      } else if (pdfErr?.code === 'rate_limited') {
        setErr('A save prompt is already open.');
      } else {
        setErr('Could not create the PDF' + (pdfErr?.code ? ` (${pdfErr.code}).` : '.'));
      }
    } finally {
      setBuilding(false);
    }
  };

  const unitBox = (u: Unit) => (
    <label className="tick" key={u}>
      <input type="checkbox" checked={expU.includes(u)} onChange={() => toggleExportUnit(u)} /> CPF-{u}
    </label>
  );
  const levelBox = (s: ServiceLevel, label: string) => (
    <label className="tick" key={s}>
      <input type="checkbox" checked={expL.includes(s)} onChange={() => toggleExportLevel(s)} /> {label}
    </label>
  );

  return (
    <>
      <h3 style={{ fontSize: 20, margin: '0 0 12px' }}>Export PDF</h3>
      <div className="form">
        <div>
          <b>Units</b>
          <div className="frow">{UNITS.map(unitBox)}</div>
        </div>
        <div>
          <b>Service levels</b>
          <div className="frow">{GROUPS.SL0.map((s) => levelBox(s, 'SL0 ' + s))}</div>
          <div className="frow">{GROUPS['SL1/3/4'].map((s) => levelBox(s, s))}</div>
        </div>
        <div className="frow">
          <span className="flabel">Order by</span>
          <div className="seg" role="group" aria-label="Order">
            <button aria-pressed={expGrp === 'unit'} onClick={() => setExportGroupOrder('unit')}>
              Unit, then level
            </button>
            <button aria-pressed={expGrp === 'level'} onClick={() => setExportGroupOrder('level')}>
              Level, then unit
            </button>
          </div>
        </div>
        <label className="tick">
          <input type="checkbox" checked={expAns} onChange={(e) => setExportIncludeAnswers(e.target.checked)} /> Include
          answers
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {docsN
            ? `${docsN} document${docsN > 1 ? 's' : ''}, one per page. The search, section and status filters in the matrix still apply.`
            : 'Pick at least one unit and one service level.'}
        </p>
        <div className="frow">
          <button className="btn" disabled={!docsN || building} onClick={handleExport}>
            {building ? 'Building…' : 'Create PDF'}
          </button>
          <button className="btn ghost" onClick={closeModal}>
            Cancel
          </button>
          <span className="err">{err}</span>
        </div>
      </div>
    </>
  );
}
