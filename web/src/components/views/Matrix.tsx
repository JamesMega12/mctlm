import type { ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { groupLabel, MODES, SLNAME } from '../../lib/constants';
import { baseMatch, cols, getSection, summary, unitMatch, type MatrixFilters } from '../../lib/derive';
import type { Check, Section, UnitMatchMode } from '../../types';
import MatrixRow from './MatrixRow';
import SectionRow from './SectionRow';

export default function Matrix() {
  const checks = useStore((s) => s.checks);
  const sections = useStore((s) => s.sections);
  const units = useStore((s) => s.units);
  const levelMap = useStore((s) => s.levels);
  const addedUnits = useStore((s) => s.addedUnits);
  const mg = useStore((s) => s.mg);
  const q = useStore((s) => s.q);
  const fsec = useStore((s) => s.fsec);
  const fu = useStore((s) => s.fu);
  const fs = useStore((s) => s.fs);
  const mode = useStore((s) => s.mode);
  const onlyCols = useStore((s) => s.onlyCols);
  const openRow = useStore((s) => s.openRow);
  const collapsedSecs = useStore((s) => s.collapsedSecs);
  const collapsedWos = useStore((s) => s.collapsedWos);
  const toggleWoCollapse = useStore((s) => s.toggleWoCollapse);

  const setGroup = useStore((s) => s.setGroup);
  const setSearch = useStore((s) => s.setSearch);
  const setSectionFilter = useStore((s) => s.setSectionFilter);
  const toggleUnitFilter = useStore((s) => s.toggleUnitFilter);
  const toggleLevelFilter = useStore((s) => s.toggleLevelFilter);
  const setUnitMode = useStore((s) => s.setUnitMode);
  const setOnlyCols = useStore((s) => s.setOnlyCols);
  const clearMatrixFilters = useStore((s) => s.clearMatrixFilters);
  const colFilter = useStore((s) => s.colFilter);
  const openExportDialog = useStore((s) => s.openExportDialog);
  const openAddSectionDialog = useStore((s) => s.openAddSectionDialog);
  const openAddUnitDialog = useStore((s) => s.openAddUnitDialog);

  const filters: MatrixFilters = { mg, q, fsec, fu, fs, mode, onlyCols, units, levelMap, addedUnits };
  const g = levelMap[mg];
  const { us, ss } = cols(filters);
  const span = 2 + us.length * ss.length;

  const secOpts = [...new Set(checks.filter((c) => c.g === mg).map((c) => c.s))];
  const filtered = checks.filter((c) => baseMatch(c, mg, filters) && unitMatch(c, filters));
  const summaryResult = summary(filters);

  // 604 checks max — a plain per-render pass here is fine; see
  // ARCHITECTURE_3.md's note on drawRows being the hot path.
  // Checks are grouped by section id and sections by WO label, in `sections`
  // order, so a section's checks are never split across two headings even if a
  // check was added to it later. SL0 has no WO headings (every section is
  // "SL0"); every other group nests its sections under a WO header, like the
  // master checklist Excel sheet.
  const showWo = mg !== 'SL0';
  const bySec = new Map<number, Check[]>();
  filtered.forEach((c) => {
    const list = bySec.get(c.s);
    if (list) list.push(c);
    else bySec.set(c.s, [c]);
  });
  const woGroups = new Map<string, Section[]>();
  sections.forEach((sec) => {
    if (!bySec.has(sec.id)) return;
    const key = showWo ? sec.wo : '';
    const list = woGroups.get(key);
    if (list) list.push(sec);
    else woGroups.set(key, [sec]);
  });

  const rows: ReactNode[] = [];
  woGroups.forEach((secs, wo) => {
    if (showWo) {
      const woCollapsed = collapsedWos.includes(wo);
      const woChecks = secs.reduce((n, sec) => n + bySec.get(sec.id)!.length, 0);
      rows.push(
        <tr
          className="wo"
          key={`wo-${wo}`}
          tabIndex={0}
          aria-expanded={!woCollapsed}
          onClick={() => toggleWoCollapse(wo)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleWoCollapse(wo);
            }
          }}
        >
          <td colSpan={span}>
            <span className="nm">
              <span className="caret">{woCollapsed ? '▸' : '▾'}</span>
              <span>
                {wo}
                <span className="muted" style={{ fontWeight: 500 }}>
                  {' '}
                  · {secs.length} section{secs.length !== 1 ? 's' : ''}, {woChecks} check{woChecks !== 1 ? 's' : ''}
                </span>
              </span>
            </span>
          </td>
        </tr>,
      );
      if (woCollapsed) return;
    }
    secs.forEach((sec) => {
      const secChecks = bySec.get(sec.id)!;
      const secCollapsed = collapsedSecs.includes(sec.id);
      rows.push(
        <SectionRow
          key={`sec-${sec.id}`}
          sec={sec}
          count={secChecks.length}
          collapsed={secCollapsed}
          span={span}
          showWo={showWo}
        />,
      );
      if (secCollapsed) return;
      secChecks.forEach((c) =>
        rows.push(
          <MatrixRow key={c.id} checkId={c.id} us={us} ss={ss} span={span} isOpen={openRow === c.id} mg={mg} fs={fs} units={units} />,
        ),
      );
    });
  });

  return (
    <>
      <h2>Matrix view</h2>
      <p className="sub">
        Single click a check to see its details (and answers, on SL0), double click to open and edit it, or click a unit box in the grid to
        tick it in or out. Click a section heading to collapse or expand it, double click to view, rename or
        remove it; use + on a heading to add a check there. Sections sit under their work order heading, which
        also collapses on click.
      </p>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Checklist">
          {Object.keys(levelMap).map((grp) => (
            <button key={grp} aria-pressed={mg === grp} onClick={() => setGroup(grp)}>
              {groupLabel(grp)}
            </button>
          ))}
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
          {secOpts.map((sid) => {
            const sec = getSection(sections, sid)!;
            return (
              <option value={sid} key={sid}>
                {sec.name}
                {mg !== 'SL0' && sec.wo ? ` · ${sec.wo}` : ''}
              </option>
            );
          })}
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
                    <button className="hbtn" onClick={() => colFilter(u, s)} title={`Show only CPF-${u} ${SLNAME(s, levelMap)}`}>
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
