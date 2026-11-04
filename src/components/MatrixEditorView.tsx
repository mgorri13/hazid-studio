import * as mx from "../matrix";
import type { RiskMatrix } from "../types";
import { TextCell } from "./fields";
import { MatrixGrid } from "./MatrixGrid";

export type MatrixScope = "default" | "study";

interface Props {
  scope: MatrixScope;
  onScope: (s: MatrixScope) => void;
  matrix: RiskMatrix;
  onChange: (fn: (m: RiskMatrix) => RiskMatrix) => void;
  /** Removing a level may affect ratings, so the owner decides how (and whether to ask first). */
  onRemoveLevel: (axis: mx.Axis, index: number) => void;
  onDefaultToStudy: () => void;
  onStudyToDefault: () => void;
}

export function MatrixEditorView(props: Props) {
  const { matrix: m, onChange } = props;

  const levels = (axis: mx.Axis, title: string) => (
    <section>
      <h2>{title}</h2>
      <table className="simple-table defs">
        <thead>
          <tr>
            <th className="def-index">Level</th>
            <th className="def-code">Code</th>
            <th className="def-label">Name</th>
            <th>Criteria</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...m[axis].keys()].reverse().map((i) => {
            const lvl = m[axis][i];
            return (
              <tr key={i}>
                <td className="def-index muted">{i + 1}</td>
                <td className="def-code">
                  <input value={lvl.code} onChange={(e) => onChange((x) => mx.updateLevel(x, axis, i, { code: e.target.value }))} />
                </td>
                <td className="def-label">
                  <input value={lvl.label} onChange={(e) => onChange((x) => mx.updateLevel(x, axis, i, { label: e.target.value }))} />
                </td>
                <td>
                  <TextCell
                    className="boxed"
                    value={lvl.description}
                    placeholder="Definition used by the team to choose this level"
                    onChange={(v) => onChange((x) => mx.updateLevel(x, axis, i, { description: v }))}
                  />
                </td>
                <td className="row-tools">
                  <button
                    className="icon-btn danger"
                    title="Remove level"
                    disabled={m[axis].length <= 1}
                    onClick={() => props.onRemoveLevel(axis, i)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="link-btn" onClick={() => onChange((x) => mx.addLevel(x, axis))}>
        + Add level above the highest
      </button>
    </section>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Risk matrix</h1>
        <div className="segmented">
          <button className={props.scope === "default" ? "active" : ""} onClick={() => props.onScope("default")}>
            Default
          </button>
          <button className={props.scope === "study" ? "active" : ""} onClick={() => props.onScope("study")}>
            This study
          </button>
        </div>
      </div>
      <div className="db-intro">
        <p className="muted">
          {props.scope === "default"
            ? "The criteria new studies start with, stored on this computer."
            : "The criteria used to rate this study, saved inside the .hazid file."}{" "}
          {m.likelihood.length} × {m.severity.length} matrix. Click a cell to change its risk class.
        </p>
        {props.scope === "default" ? (
          <button className="btn" onClick={props.onDefaultToStudy}>Apply to this study</button>
        ) : (
          <button className="btn" onClick={props.onStudyToDefault}>Save as default</button>
        )}
      </div>

      <MatrixGrid
        matrix={m}
        cell={(li, si) => m.classes.find((c) => c.code === m.cells[li]?.[si])?.label ?? ""}
        onCellClick={(li, si) => onChange((x) => mx.cycleCell(x, li, si))}
      />

      <section>
        <h2>Risk classes</h2>
        <p className="muted section-note">From lowest to highest. Clicking a cell cycles through them in this order.</p>
        <table className="simple-table defs">
          <tbody>
            {m.classes.map((c, i) => (
              <tr key={c.code}>
                <td className="def-color">
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => onChange((x) => mx.updateClass(x, c.code, { color: e.target.value }))}
                  />
                </td>
                <td>
                  <input value={c.label} onChange={(e) => onChange((x) => mx.updateClass(x, c.code, { label: e.target.value }))} />
                </td>
                <td className="row-tools">
                  <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => onChange((x) => mx.moveClass(x, c.code, -1))}>↑</button>
                  <button className="icon-btn" title="Move down" disabled={i === m.classes.length - 1} onClick={() => onChange((x) => mx.moveClass(x, c.code, 1))}>↓</button>
                  <button
                    className="icon-btn danger"
                    title="Remove class (its cells take the first class)"
                    disabled={m.classes.length <= 1}
                    onClick={() => onChange((x) => mx.removeClass(x, c.code))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="link-btn" onClick={() => onChange(mx.addClass)}>
          + Add risk class
        </button>
      </section>

      {levels("likelihood", "Likelihood (frequency) criteria")}
      {levels("severity", "Severity criteria")}
    </div>
  );
}
