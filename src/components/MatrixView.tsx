import { useState } from "react";
import type { Level, RiskMatrix, Study } from "../types";

export function MatrixView({ study, update }: { study: Study; update: (fn: (s: Study) => Study) => void }) {
  const [mode, setMode] = useState<"current" | "residual">("current");
  const [editing, setEditing] = useState(false);
  const m = study.matrix;

  const setMatrix = (fn: (m: RiskMatrix) => RiskMatrix) => update((s) => ({ ...s, matrix: fn(s.matrix) }));

  const count = (l: number, s: number) =>
    study.rows.filter((r) =>
      mode === "current"
        ? r.likelihood === l && r.severity === s
        : r.residualLikelihood === l && r.residualSeverity === s,
    ).length;

  // In edit mode a click cycles the cell through the risk classes.
  const cycleCell = (li: number, si: number) =>
    setMatrix((mx) => {
      const order = mx.classes.map((c) => c.code);
      const next = order[(order.indexOf(mx.cells[li][si]) + 1) % order.length];
      return { ...mx, cells: mx.cells.map((row, i) => (i === li ? row.map((c, j) => (j === si ? next : c)) : row)) };
    });

  const setLevel = (axis: "likelihood" | "severity", idx: number, patch: Partial<Level>) =>
    setMatrix((mx) => ({ ...mx, [axis]: mx[axis].map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const unrated = study.rows.filter((r) =>
    mode === "current" ? r.likelihood == null || r.severity == null : r.residualLikelihood == null || r.residualSeverity == null,
  ).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Risk matrix</h1>
        <div className="head-tools">
          <div className="segmented">
            <button className={mode === "current" ? "active" : ""} onClick={() => setMode("current")}>Current</button>
            <button className={mode === "residual" ? "active" : ""} onClick={() => setMode("residual")}>Residual</button>
          </div>
          <button className={`btn ${editing ? "primary" : ""}`} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit matrix"}
          </button>
        </div>
      </div>
      <p className="muted">
        Number of scenarios in each cell{unrated > 0 && ` · ${unrated} not yet rated`}
        {editing && " · click a cell to change its risk class"}
      </p>

      <div className="matrix">
        <div className="matrix-axis-y">Likelihood</div>
        <table>
          <tbody>
            {[...m.likelihood.keys()].reverse().map((li) => (
              <tr key={li}>
                <th className="matrix-row-head">
                  <b>{m.likelihood[li].code}</b> {m.likelihood[li].label}
                </th>
                {m.severity.map((_, si) => {
                  const cls = m.classes.find((c) => c.code === m.cells[li][si]);
                  const n = count(li + 1, si + 1);
                  return (
                    <td
                      key={si}
                      className={`matrix-cell ${editing ? "editable" : ""}`}
                      style={{ background: cls?.color }}
                      title={cls?.label}
                      onClick={editing ? () => cycleCell(li, si) : undefined}
                    >
                      {editing ? cls?.code : n > 0 ? n : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th />
              {m.severity.map((s, si) => (
                <th key={si} className="matrix-col-head">
                  <b>{s.code}</b> {s.label}
                </th>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="matrix-axis-x">Severity</div>
      </div>

      <div className="legend">
        {m.classes.map((c) => (
          <span key={c.code} className="legend-item">
            <i style={{ background: c.color }} /> {c.label}
          </span>
        ))}
      </div>

      {(["likelihood", "severity"] as const).map((axis) => (
        <section key={axis}>
          <h2>{axis === "likelihood" ? "Likelihood" : "Severity"} definitions</h2>
          <table className="simple-table defs">
            <tbody>
              {m[axis].map((lvl, i) => (
                <tr key={i}>
                  <td className="def-code">{lvl.code}</td>
                  <td className="def-label">
                    {editing ? (
                      <input value={lvl.label} onChange={(e) => setLevel(axis, i, { label: e.target.value })} />
                    ) : (
                      lvl.label
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input value={lvl.description} onChange={(e) => setLevel(axis, i, { description: e.target.value })} />
                    ) : (
                      lvl.description
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
