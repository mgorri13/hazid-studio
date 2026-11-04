import { useState } from "react";
import type { Study } from "../types";
import { MatrixGrid } from "./MatrixGrid";

export function MapView({ study, onEditMatrix }: { study: Study; onEditMatrix: () => void }) {
  const [mode, setMode] = useState<"current" | "residual">("current");

  const rated = (l: number | null, s: number | null) => l != null && s != null;
  const pair = (r: Study["rows"][number]) =>
    mode === "current" ? [r.likelihood, r.severity] : [r.residualLikelihood, r.residualSeverity];

  const count = (li: number, si: number) =>
    study.rows.filter((r) => {
      const [l, s] = pair(r);
      return l === li + 1 && s === si + 1;
    }).length;
  const unrated = study.rows.filter((r) => !rated(...(pair(r) as [number | null, number | null]))).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Risk map</h1>
        <div className="head-tools">
          <div className="segmented">
            <button className={mode === "current" ? "active" : ""} onClick={() => setMode("current")}>Current</button>
            <button className={mode === "residual" ? "active" : ""} onClick={() => setMode("residual")}>Residual</button>
          </div>
          <button className="btn" onClick={onEditMatrix}>Edit matrix</button>
        </div>
      </div>
      <p className="muted">
        Number of scenarios in each cell of this study's risk matrix{unrated > 0 && ` · ${unrated} not yet rated`}
      </p>
      <MatrixGrid
        matrix={study.matrix}
        cell={(li, si) => {
          const n = count(li, si);
          return n > 0 ? n : "";
        }}
      />
    </div>
  );
}
