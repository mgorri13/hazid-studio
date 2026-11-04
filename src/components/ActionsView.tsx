import { useMemo, useState } from "react";
import { riskClass, rowRefs } from "../risk";
import { STATUSES, type Row, type Study } from "../types";
import { RiskBadge, TextCell } from "./fields";

export function ActionsView({ study, update }: { study: Study; update: (fn: (s: Study) => Study) => void }) {
  const [filter, setFilter] = useState("All");
  const refs = useMemo(() => rowRefs(study), [study]);
  const nodeName = new Map(study.nodes.map((n) => [n.id, n.name]));

  const actions = study.nodes
    .flatMap((n) => study.rows.filter((r) => r.nodeId === n.id))
    .filter((r) => r.recommendations.trim() !== "")
    .filter((r) => filter === "All" || r.status === filter);

  const setRow = (id: string, patch: Partial<Row>) =>
    update((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const m = study.matrix;
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Action register</h1>
        <div className="segmented">
          {["All", ...STATUSES].map((s) => (
            <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">Every scenario with a recommendation. Edit recommendations in the node worksheet.</p>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="c-ref">Ref</th>
              <th className="c-gw">Node</th>
              <th>Hazard</th>
              <th>Recommendation</th>
              <th className="c-owner">Owner</th>
              <th className="c-status">Status</th>
              <th className="c-risk">Risk</th>
              <th className="c-risk">Res. risk</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((r) => (
              <tr key={r.id}>
                <td className="c-ref ref">{refs.get(r.id)}</td>
                <td className="c-gw text">{nodeName.get(r.nodeId)}</td>
                <td className="text">{r.hazard}</td>
                <td className="text">{r.recommendations}</td>
                <td className="c-owner"><TextCell value={r.owner} onChange={(v) => setRow(r.id, { owner: v })} /></td>
                <td className="c-status">
                  <select value={r.status} onChange={(e) => setRow(r.id, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="c-risk"><RiskBadge cls={riskClass(m, r.likelihood, r.severity)} /></td>
                <td className="c-risk"><RiskBadge cls={riskClass(m, r.residualLikelihood, r.residualSeverity)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {actions.length === 0 && <p className="empty-note">No actions.</p>}
      </div>
    </div>
  );
}
