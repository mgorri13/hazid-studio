import { useEffect, useMemo, useState } from "react";
import { newRow } from "../defaults";
import { riskClass, rowRefs } from "../risk";
import { STATUSES, type Node, type Row, type Study } from "../types";
import { LevelSelect, RiskBadge, TextCell } from "./fields";
import { AttachmentsPanel } from "./AttachmentsPanel";

interface Props {
  study: Study;
  node: Node;
  update: (fn: (s: Study) => Study) => void;
  /** Row to scroll to and flash, e.g. when coming from the risk landscape. */
  highlightId?: string;
}

export function NodeView({ study, node, update, highlightId }: Props) {
  const [showChecklist, setShowChecklist] = useState(!highlightId);

  useEffect(() => {
    if (highlightId) document.getElementById(`row-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId]);
  const rows = study.rows.filter((r) => r.nodeId === node.id);
  const refs = useMemo(() => rowRefs(study), [study]);
  const m = study.matrix;

  const setNode = (patch: Partial<Node>) =>
    update((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) }));

  const setRow = (id: string, patch: Partial<Row>) =>
    update((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const addRow = (scenario = "", after?: string) =>
    update((s) => {
      const row = newRow(node.id, scenario);
      if (!after) {
        // Append after the last row of this node so references stay grouped.
        const last = s.rows.map((r) => r.nodeId).lastIndexOf(node.id);
        const at = last === -1 ? s.rows.length : last + 1;
        return { ...s, rows: [...s.rows.slice(0, at), row, ...s.rows.slice(at)] };
      }
      const at = s.rows.findIndex((r) => r.id === after) + 1;
      return { ...s, rows: [...s.rows.slice(0, at), { ...row, scenario: s.rows[at - 1].scenario }, ...s.rows.slice(at)] };
    });

  const removeRow = (id: string) => update((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }));

  const moveRow = (id: string, dir: -1 | 1) =>
    update((s) => {
      const idx = s.rows.findIndex((r) => r.id === id);
      // Swap with the neighbouring row of the same node, skipping rows of other nodes.
      let j = idx + dir;
      while (j >= 0 && j < s.rows.length && s.rows[j].nodeId !== node.id) j += dir;
      if (j < 0 || j >= s.rows.length) return s;
      const next = [...s.rows];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...s, rows: next };
    });

  const usage = new Map<string, number>();
  for (const r of rows) usage.set(r.scenario, (usage.get(r.scenario) ?? 0) + 1);
  const allScenarios = study.categories.flatMap((c) => c.scenarios);
  const covered = allScenarios.filter((sc) => usage.has(sc.name)).length;

  return (
    <div className="page wide">
      <div className="node-header">
        <input className="node-title" value={node.name} onChange={(e) => setNode({ name: e.target.value })} />
        <div className="node-meta">
          <input
            placeholder="Description of the node / area / operation"
            value={node.description}
            onChange={(e) => setNode({ description: e.target.value })}
          />
          <input
            placeholder="Drawings / documents"
            value={node.drawings}
            onChange={(e) => setNode({ drawings: e.target.value })}
          />
        </div>
      </div>

      <AttachmentsPanel study={study} node={node} update={update} />

      <section className="checklist-panel">
        <button className="panel-toggle" onClick={() => setShowChecklist((v) => !v)}>
          <span>{showChecklist ? "▾" : "▸"} Hazardous scenario checklist</span>
          <span className="muted">
            {covered} of {allScenarios.length} addressed
          </span>
        </button>
        {showChecklist && (
          <div className="checklist-groups">
            {study.categories.map((cat) => (
              <div key={cat.id} className="checklist-group">
                <div className="checklist-cat">{cat.name}</div>
                <div className="chips">
                  {cat.scenarios.map((sc) => (
                    <button
                      key={sc.id}
                      className={`chip ${usage.has(sc.name) ? "used" : ""}`}
                      title={`${sc.description}\n\nClick to add a row for this hazardous scenario.`}
                      onClick={() => addRow(sc.name)}
                    >
                      {sc.name}
                      {usage.has(sc.name) && <span className="chip-count">{usage.get(sc.name)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="c-ref">Ref</th>
              <th className="c-gw">Hazardous scenario</th>
              <th>Hazard</th>
              <th>Cause</th>
              <th>Consequence</th>
              <th>Existing safeguards</th>
              <th className="c-lvl" title="Likelihood">L</th>
              <th className="c-lvl" title="Severity">S</th>
              <th className="c-risk">Risk</th>
              <th>Recommendations</th>
              <th className="c-lvl" title="Residual likelihood">Res. L</th>
              <th className="c-lvl" title="Residual severity">Res. S</th>
              <th className="c-risk">Res. risk</th>
              <th className="c-owner">Owner</th>
              <th className="c-status">Status</th>
              <th>Comments</th>
              <th className="c-tools" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} id={`row-${r.id}`} className={r.id === highlightId ? "highlight" : ""}>
                <td className="c-ref ref">{refs.get(r.id)}</td>
                <td className="c-gw">
                  <select value={r.scenario} onChange={(e) => setRow(r.id, { scenario: e.target.value })}>
                    <option value="">–</option>
                    {study.categories.map((cat) => (
                      <optgroup key={cat.id} label={cat.name}>
                        {cat.scenarios.map((sc) => (
                          <option key={sc.id} value={sc.name}>
                            {sc.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {r.scenario && !allScenarios.some((sc) => sc.name === r.scenario) && (
                      <option value={r.scenario}>{r.scenario}</option>
                    )}
                  </select>
                </td>
                <td><TextCell value={r.hazard} onChange={(v) => setRow(r.id, { hazard: v })} /></td>
                <td><TextCell value={r.cause} onChange={(v) => setRow(r.id, { cause: v })} /></td>
                <td><TextCell value={r.consequence} onChange={(v) => setRow(r.id, { consequence: v })} /></td>
                <td><TextCell value={r.safeguards} onChange={(v) => setRow(r.id, { safeguards: v })} /></td>
                <td className="c-lvl">
                  <LevelSelect title="Likelihood" levels={m.likelihood} value={r.likelihood} onChange={(v) => setRow(r.id, { likelihood: v })} />
                </td>
                <td className="c-lvl">
                  <LevelSelect title="Severity" levels={m.severity} value={r.severity} onChange={(v) => setRow(r.id, { severity: v })} />
                </td>
                <td className="c-risk"><RiskBadge cls={riskClass(m, r.likelihood, r.severity)} /></td>
                <td><TextCell value={r.recommendations} onChange={(v) => setRow(r.id, { recommendations: v })} /></td>
                <td className="c-lvl">
                  <LevelSelect title="Residual likelihood" levels={m.likelihood} value={r.residualLikelihood} onChange={(v) => setRow(r.id, { residualLikelihood: v })} />
                </td>
                <td className="c-lvl">
                  <LevelSelect title="Residual severity" levels={m.severity} value={r.residualSeverity} onChange={(v) => setRow(r.id, { residualSeverity: v })} />
                </td>
                <td className="c-risk"><RiskBadge cls={riskClass(m, r.residualLikelihood, r.residualSeverity)} /></td>
                <td className="c-owner"><TextCell value={r.owner} onChange={(v) => setRow(r.id, { owner: v })} /></td>
                <td className="c-status">
                  <select value={r.status} onChange={(e) => setRow(r.id, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td><TextCell value={r.comments} onChange={(v) => setRow(r.id, { comments: v })} /></td>
                <td className="c-tools row-tools">
                  <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => moveRow(r.id, -1)}>↑</button>
                  <button className="icon-btn" title="Move down" disabled={i === rows.length - 1} onClick={() => moveRow(r.id, 1)}>↓</button>
                  <button className="icon-btn" title="Insert row below" onClick={() => addRow("", r.id)}>+</button>
                  <button className="icon-btn danger" title="Delete row" onClick={() => removeRow(r.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="empty-note">No scenarios yet. Pick a hazardous scenario above or add a blank row.</p>
        )}
      </div>
      <button className="link-btn" onClick={() => addRow()}>
        + Add row
      </button>
    </div>
  );
}
