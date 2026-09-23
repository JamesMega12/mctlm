import type { ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { GROUPS, MODES, SLNAME } from '../../lib/constants';
import { baseMatch, cols, getSection, summary, unitMatch, type MatrixFilters } from '../../lib/derive';
import type { SyncStatus, UnitMatchMode } from '../../types';
import MatrixRow from './MatrixRow';

export default function Matrix() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const units = useStore((s) => s.units);
  const mg = useStore((s) => s.mg);
  const q = useStore((s) => s.q);
  const fsec = useStore((s) => s.fsec);
  const fst = useStore((s) => s.fst);
  const fu = useStore((s) => s.fu);
  const fs = useStore((s) => s.fs);
  const mode = useStore((s) => s.mode);
  const onlyCols = useStore((s) => s.onlyCols);
  const openRow = useStore((s) => s.openRow);

  const setGroup = useStore((s) => s.setGroup);
  const setSearch = useStore((s) => s.setSearch);
  const setSectionFilter = useStore((s) => s.setSectionFilter);
  const setStatusFilter = useStore((s) => s.setStatusFilter);
  const toggleUnitFilter = useStore((s) => s.toggleUnitFilter);
  const toggleLevelFilter = useStore((s) => s.toggleLevelFilter);
  const setUnitMode = useStore((s) => s.setUnitMode);
  const setOnlyCols = useStore((s) => s.setOnlyCols);
  const clearMatrixFilters = useStore((s) => s.clearMatrixFilters);
  const colFilter = useStore((s) => s.colFilter);
  const openAddCheckDialog = useStore((s) => s.openAddCheckDialog);
  const openExportDialog = useStore((s) => s.openExportDialog);
  const openSectionDrawer = useStore((s) => s.openSectionDrawer);
  const openAddSectionDialog = useStore((s) => s.openAddSectionDialog);
  const openAddUnitDialog = useStore((s) => s.openAddUnitDialog);

  const filters: MatrixFilters = { mg, q, fsec, fst, fu, fs, mode, onlyCols, units };
  const g = GROUPS[mg];
  const { us, ss } = cols(filters);
  const span = 2 + us.length * ss.length;

  const secOpts = [...new Set(checks.filter((c) => c.g === mg).map((c) => c.s))];
  const filtered = checks.filter((c) => baseMatch(c, mg, filters) && unitMatch(c, filters));
  const summaryResult = summary(filters);

  // 604 checks max — a plain per-render pass here is fine; see
  // ARCHITECTURE_3.md's note on drawRows being the hot path.
  const rows: ReactNode[] = [];
  let last = -1;
  filtered.forEach((c) => {
    if (c.s !== last) {
      last = c.s;
      const sec = getSection(sections, c.s)!;
      rows.push(
        <tr className="sec" key={`sec-${sec.id}`} onClick={() => openSectionDrawer(sec.id)} style={{ cursor: 'pointer' }}>
          <td colSpan={span}>
            <span>
              {sec.name}
              {sec.wo && sec.wo !== 'SL0' && (
                <span className="muted" style={{ fontWeight: 500 }}>
                  {' '}
                  · {sec.wo}
                </span>
              )}
            </span>
            <button
              className="addbtn"
              onClick={(e) => {
                e.stopPropagation();
                openAddCheckDialog(sec.id);
              }}
              title={`Add a check to ${sec.name}`}
              aria-label={`Add a check to ${sec.name}`}
            >
              +
            </button>
          </td>
        </tr>,
      );
    }
    rows.push(
      <MatrixRow key={c.id} checkId={c.id} us={us} ss={ss} span={span} isOpen={openRow === c.id} mg={mg} fs={fs} units={units} />,
    );
  });

  return (
    <>
      <h2>Matrix view</h2>
      <p className="sub">
        Single click a check to see its answers, double click to open and edit it, or click a unit box in the grid to
        tick it in or out. Click a section heading to view, rename or remove it; use + on a heading to add a check
        there.
      </p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Checklist">
          <button aria-pressed={mg === 'SL0'} onClick={() => setGroup('SL0')}>
            SL0 checks
          </button>
          <button aria-pressed={mg !== 'SL0'} onClick={() => setGroup('SL1/3/4')}>
            SL1, 3 &amp; 4 tasks
          </button>
        </div>
        <input
          type="search"
          placeholder="Search check wording"
          value={q}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search checks"
        />
        <select
          value={fsec}
          onChange={(e) => setSectionFilter(e.target.value === '' ? '' : Number(e.target.value))}
          aria-label="Section"
        >
          <option value="">All sections</option>
          {secOpts.map((sid) => (
            <option value={sid} key={sid}>
              {getSection(sections, sid)!.name}
            </option>
          ))}
        </select>
        <select value={fst} onChange={(e) => setStatusFilter(e.target.value as SyncStatus | '')} aria-label="Status">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="drift">Drift</option>
        </select>
      </div>

      <div className="filters panel">
        <div className="frow">
          <span className="flabel">Units</span>
          {units.map((u) => (
            <button key={u} className="chip" aria-pressed={fu.includes(u)} onClick={() => toggleUnitFilter(u)}>
              CPF-{u}
            </button>
          ))}
          <button className="linkbtn" onClick={openAddUnitDialog} title="Add a new unit">
            + Add unit
          </button>
          <select
            value={mode}
            onChange={(e) => setUnitMode(e.target.value as UnitMatchMode)}
            aria-label="Unit match"
            disabled={!fu.length}
          >
            {Object.entries(MODES).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="frow">
          <span className="flabel">Service levels</span>
          {g.map((s) => (
            <button key={s} className="chip" aria-pressed={fs.includes(s)} onClick={() => toggleLevelFilter(s)}>
              {s}
            </button>
          ))}
          <label className="tick">
            <input type="checkbox" checked={onlyCols} onChange={(e) => setOnlyCols(e.target.checked)} /> Show selected
            columns only
          </label>
          {(fu.length > 0 || fs.length > 0) && (
            <button className="linkbtn" onClick={clearMatrixFilters}>
              Clear
            </button>
          )}
          <span style={{ marginLeft: 'auto' }}>
            <button className="btn ghost" onClick={openExportDialog}>
              Export PDF
            </button>
          </span>
        </div>
        <div className="fsum">
          {summaryResult.bold ? <b>{filtered.length}</b> : filtered.length}
          {summaryResult.suffix}
        </div>
      </div>

      <div className="mwrap">
        <table className="m">
          <thead>
            <tr>
              <th className="name" rowSpan={2}>
                Check
              </th>
              <th rowSpan={2} title="Units using this check at the selected levels">
                Units
              </th>
              {us.map((u) => (
                <th className="u" colSpan={ss.length} key={u}>
                  <button className="hbtn" onClick={() => colFilter(u)} title={`Show only CPF-${u}`}>
                    CPF-{u}
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {us.map((u) =>
                ss.map((s, i) => (
                  <th className={i === 0 ? 'u' : undefined} key={u + s}>
                    <button className="hbtn" onClick={() => colFilter(u, s)} title={`Show only CPF-${u} ${SLNAME(s)}`}>
                      {s}
                    </button>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              rows
            ) : (
              <tr>
                <td colSpan={99} style={{ padding: 30 }} className="muted">
                  No checks match. Change the unit mode or clear the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => openAddSectionDialog(mg)}>
          + Add section
        </button>
      </p>
    </>
  );
}
