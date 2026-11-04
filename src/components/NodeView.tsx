import { useMemo, useState } from "react";
import { newRow } from "../defaults";
import { riskClass, rowRefs } from "../risk";
import { STATUSES, type Node, type Row, type Study } from "../types";
import { LevelSelect, RiskBadge, TextCell } from "./fields";

interface Props {
  study: Study;
  node: Node;
  update: (fn: (s: Study) => Study) => void;
}

export function NodeView({ study, node, update }: Props) {
  const [showGuidewords, setShowGuidewords] = useState(true);
  const rows = study.rows.filter((r) => r.nodeId === node.id);
  const refs = useMemo(() => rowRefs(study), [study]);
  const m = study.matrix;

  const setNode = (patch: Partial<Node>) =>
    update((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) }));

  const setRow = (id: string, patch: Partial<Row>) =>
    update((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const addRow = (guideword = "", after?: string) =>
    update((s) => {
      const row = newRow(node.id, guideword);
      if (!after) {
        // Append after the last row of this node so references stay grouped.
        const last = s.rows.map((r) => r.nodeId).lastIndexOf(node.id);
        const at = last === -1 ? s.rows.length : last + 1;
        return { ...s, rows: [...s.rows.slice(0, at), row, ...s.rows.slice(at)] };
      }
      const at = s.rows.findIndex((r) => r.id === after) + 1;
      return { ...s, rows: [...s.rows.slice(0, at), { ...row, guideword: s.rows[at - 1].guideword }, ...s.rows.slice(at)] };
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
  for (const r of rows) usage.set(r.guideword, (usage.get(r.guideword) ?? 0) + 1);
  const categories = [...new Set(study.guidewords.map((g) => g.category))];
  const covered = study.guidewords.filter((g) => usage.has(g.name)).length;

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

      <section className="guideword-panel">
        <button className="panel-toggle" onClick={() => setShowGuidewords((v) => !v)}>
          <span>{showGuidewords ? "▾" : "▸"} Guideword checklist</span>
          <span className="muted">
            {covered} of {study.guidewords.length} addressed
          </span>
        </button>
        {showGuidewords && (
          <div className="guideword-groups">
            {categories.map((cat) => (
              <div key={cat} className="guideword-group">
                <div className="guideword-cat">{cat}</div>
                <div className="chips">
                  {study.guidewords
                    .filter((g) => g.category === cat)
                    .map((g) => (
                      <button
                        key={g.id}
                        className={`chip ${usage.has(g.name) ? "used" : ""}`}
                        title={`${g.prompt}\n\nClick to add a scenario with this guideword.`}
                        onClick={() => addRow(g.name)}
                      >
                        {g.name}
                        {usage.has(g.name) && <span className="chip-count">{usage.get(g.name)}</span>}
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
              <th className="c-gw">Guideword</th>
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
              <tr key={r.id}>
                <td className="c-ref ref">{refs.get(r.id)}</td>
                <td className="c-gw">
                  <select value={r.guideword} onChange={(e) => setRow(r.id, { guideword: e.target.value })}>
                    <option value="">–</option>
                    {categories.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {study.guidewords
                          .filter((g) => g.category === cat)
                          .map((g) => (
                            <option key={g.id} value={g.name}>
                              {g.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    {r.guideword && !study.guidewords.some((g) => g.name === r.guideword) && (
                      <option value={r.guideword}>{r.guideword}</option>
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
                  <button className="icon-btn" title="Insert scenario below" onClick={() => addRow("", r.id)}>+</button>
                  <button className="icon-btn danger" title="Delete scenario" onClick={() => removeRow(r.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="empty-note">No scenarios yet. Pick a guideword above or add a blank scenario.</p>
        )}
      </div>
      <button className="link-btn" onClick={() => addRow()}>
        + Add scenario
      </button>
    </div>
  );
}
