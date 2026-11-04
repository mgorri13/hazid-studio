import type { ReactNode } from "react";
import type { RiskMatrix } from "../types";

/** The likelihood × severity grid, highest likelihood at the top. Shared by the risk map and the matrix editor. */
export function MatrixGrid(props: {
  matrix: RiskMatrix;
  cell: (li: number, si: number) => ReactNode;
  onCellClick?: (li: number, si: number) => void;
}) {
  const m = props.matrix;
  return (
    <>
      <div className="matrix">
        <div className="matrix-axis-y">Likelihood</div>
        <table>
          <tbody>
            {[...m.likelihood.keys()].reverse().map((li) => (
              <tr key={li}>
                <th className="matrix-row-head" title={m.likelihood[li].description}>
                  <b>{m.likelihood[li].code}</b> {m.likelihood[li].label}
                </th>
                {m.severity.map((_, si) => {
                  const cls = m.classes.find((c) => c.code === m.cells[li]?.[si]);
                  const click = props.onCellClick;
                  return (
                    <td
                      key={si}
                      className={`matrix-cell ${click ? "editable" : ""}`}
                      style={{ background: cls?.color }}
                      title={cls?.label}
                      onClick={click ? () => click(li, si) : undefined}
                    >
                      {props.cell(li, si)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th />
              {m.severity.map((s, si) => (
                <th key={si} className="matrix-col-head" title={s.description}>
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
    </>
  );
}
