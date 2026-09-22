import { useRef } from 'react';
import { useStore } from '../../store/useStore';
import { SLNAME, UNITS } from '../../lib/constants';
import { has } from '../../lib/derive';
import type { Group, ServiceLevel, Unit } from '../../types';

interface Props {
  checkId: number;
  us: Unit[];
  ss: ServiceLevel[];
  span: number;
  isOpen: boolean;
  mg: Group;
  fs: ServiceLevel[];
}

/** One matrix row, plus its expanded answer strip when open. A single click
 * expands the row (debounced 200ms so it doesn't fire before a double
 * click); a double click, Enter, or the "Open and edit" button opens the
 * drawer in edit mode; Space toggles the row immediately. */
export default function MatrixRow({ checkId, us, ss, span, isOpen, mg, fs }: Props) {
  const c = useStore((s) => s.checks[checkId]);
  const toggleOpenRow = useStore((s) => s.toggleOpenRow);
  const openDrawer = useStore((s) => s.openDrawer);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const levelFilters = { fs, mg };
  // Always counted against all 4 units, independent of which unit columns
  // are currently shown — matches the original's UNITS.filter(...).length.
  const unitCount = UNITS.filter((u) => has(c, u, levelFilters)).length;

  const handleRowClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => toggleOpenRow(checkId), 200);
  };
  const handleRowDoubleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    openDrawer(checkId, true);
  };

  return (
    <>
      <tr
        className={`row${isOpen ? ' on' : ''}`}
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (clickTimer.current) clearTimeout(clickTimer.current);
            openDrawer(checkId, true);
          } else if (e.key === ' ') {
            e.preventDefault();
            if (clickTimer.current) clearTimeout(clickTimer.current);
            toggleOpenRow(checkId);
          }
        }}
      >
        <td className="name">
          <span className="nm">
            <span className="caret">{isOpen ? '▾' : '▸'}</span>
            <span className="clamp">{c.n}</span>
          </span>
        </td>
        <td>
          <span className={`ucount ${unitCount === 4 ? 'full' : ''}`}>{unitCount}/4</span>
        </td>
        {us.map((u) =>
          ss.map((s, i) => {
            const r = c.rows.find((row) => row.u === u && row.s === s);
            return (
              <td className={i === 0 ? 'gl' : undefined} key={u + s}>
                <i className={`dot ${r ? r.st : 'none'}`} title={`CPF-${u} ${SLNAME(s)}: ${r ? r.st : 'not in document'}`} />
              </td>
            );
          }),
        )}
      </tr>
      {isOpen && (
        <tr className="det">
          <td colSpan={span}>
            <div className="detin">
              <b>Answers</b>
              {c.o.length ? (
                <div className="answers">
                  {c.o.map((o, i) => (
                    <span className={`ans ${o.bad ? 'bad' : 'good'}`} key={i}>
                      <i />
                      {o.t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="muted">
                  No answer options in the source for this task.{' '}
                  {c.g === 'SL0' ? '' : 'SL1, 3 and 4 tasks have none in the ACP export.'}
                </div>
              )}
              <div className="detfoot">
                <span className="muted">
                  {c.rows.length} document{c.rows.length > 1 ? 's' : ''} · {c.swi ? 'SWI needed' : 'no SWI'}
                </span>
                <button
                  className="btn ghost sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDrawer(checkId, true);
                  }}
                >
                  Open and edit
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
