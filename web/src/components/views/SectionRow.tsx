import { useRef } from 'react';
import { useStore } from '../../store/useStore';
import type { Section } from '../../types';

interface Props {
  sec: Section;
  count: number;
  collapsed: boolean;
  span: number;
  /** Show the WO label beside the name. False on SL0, where it is always "SL0". */
  showWo: boolean;
}

/** A section heading in the matrix. A single click collapses or expands the
 * section's checks (debounced 200ms so it doesn't fire before a double
 * click); a double click or Enter opens the section drawer to view, rename or
 * remove it. Space toggles immediately. The + button adds a check to this
 * section. Same click model as MatrixRow. */
export default function SectionRow({ sec, count, collapsed, span, showWo }: Props) {
  const toggleSectionCollapse = useStore((s) => s.toggleSectionCollapse);
  const openSectionDrawer = useStore((s) => s.openSectionDrawer);
  const openAddCheckDialog = useStore((s) => s.openAddCheckDialog);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  };
  const handleClick = () => {
    cancelPending();
    clickTimer.current = setTimeout(() => toggleSectionCollapse(sec.id), 200);
  };
  const handleDoubleClick = () => {
    cancelPending();
    openSectionDrawer(sec.id);
  };

  return (
    <tr
      className="sec"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          cancelPending();
          openSectionDrawer(sec.id);
        } else if (e.key === ' ') {
          e.preventDefault();
          cancelPending();
          toggleSectionCollapse(sec.id);
        }
      }}
    >
      <td className="name">
        <div className="secin">
          <span className="nm">
            <span className="caret">{collapsed ? '▸' : '▾'}</span>
            <span>
              {sec.name}
              {showWo && sec.wo && (
                <span className="muted" style={{ fontWeight: 500 }}>
                  {' '}
                  · {sec.wo}
                </span>
              )}
              <span className="muted" style={{ fontWeight: 500 }}>
                {' '}
                ({count})
              </span>
            </span>
          </span>
          <button
            className="addbtn"
            onClick={(e) => {
              e.stopPropagation();
              openAddCheckDialog(sec.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            title={`Add a check to ${sec.name}`}
            aria-label={`Add a check to ${sec.name}`}
          >
            +
          </button>
        </div>
      </td>
      <td colSpan={span - 1} />
    </tr>
  );
}
