import { useMemo, useState } from "react";
import { riskClass, rowRefs } from "../risk";
import type { Level, Row, Study } from "../types";
import { RiskBadge } from "./fields";

interface Props {
  study: Study;
  onOpenRow: (row: Row) => void;
}

export function LandscapeView({ study, onOpenRow }: Props) {
  const [mode, setMode] = useState<"current" | "residual">("current");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const refs = useMemo(() => rowRefs(study), [study]);
  const m = study.matrix;

  const rating = (r: Row) =>
    mode === "current" ? riskClass(m, r.likelihood, r.severity) : riskClass(m, r.residualLikelihood, r.residualSeverity);

  const selected = study.rows.find((r) => r.id === selectedId);

  return (
    <div className={`landscape ${selected ? "with-panel" : ""}`}>
      <div className="page wide">
        <div className="page-head">
          <h1>Risk landscape</h1>
          <div className="head-tools">
            <div className="legend inline">
              {m.classes.map((c) => (
                <span key={c.code} className="legend-item">
                  <i style={{ background: c.color }} /> {c.label}
                </span>
              ))}
              <span className="legend-item">
                <i className="unrated" /> Not rated
              </span>
            </div>
            <div className="segmented">
              <button className={mode === "current" ? "active" : ""} onClick={() => setMode("current")}>Current</button>
              <button className={mode === "residual" ? "active" : ""} onClick={() => setMode("residual")}>Residual</button>
            </div>
          </div>
        </div>
        <p className="muted">Every hazardous scenario in the study, by node. Click one to see its summary.</p>

        {study.nodes.length === 0 && <p className="empty-note">No nodes yet.</p>}
        {study.nodes.map((node, ni) => {
          const rows = study.rows.filter((r) => r.nodeId === node.id);
          return (
            <section key={node.id} className="ls-node">
              <div className="ls-node-head">
                <span className="node-num">{ni + 1}</span>
                <span className="ls-node-name">{node.name || "Unnamed"}</span>
                {node.description && <span className="muted ls-node-desc">{node.description}</span>}
                <span className="ls-counts">
                  {m.classes.map((c) => {
                    const n = rows.filter((r) => rating(r)?.code === c.code).length;
                    return n > 0 ? (
                      <span key={c.code} className="ls-count" title={c.label}>
                        <i style={{ background: c.color }} />
                        {n}
                      </span>
                    ) : null;
                  })}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="muted ls-empty">No scenarios</p>
              ) : (
                <div className="ls-tiles">
                  {rows.map((r) => {
                    const cls = rating(r);
                    return (
                      <button
                        key={r.id}
                        className={`ls-tile ${cls ? "" : "unrated"} ${r.id === selectedId ? "selected" : ""}`}
                        style={cls ? { background: cls.color } : undefined}
                        onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                      >
                        <span className="ls-tile-top">
                          <span className="ls-ref">{refs.get(r.id)}</span>
                          {cls && <span className="ls-class">{cls.label}</span>}
                        </span>
                        <span className="ls-scenario">{r.scenario || "No hazardous scenario"}</span>
                        {r.hazard && <span className="ls-hazard">{r.hazard}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {selected && (
        <RowSummary
          study={study}
          row={selected}
          reference={refs.get(selected.id) ?? ""}
          onClose={() => setSelectedId(null)}
          onOpen={() => onOpenRow(selected)}
        />
      )}
    </div>
  );
}

function RowSummary(props: { study: Study; row: Row; reference: string; onClose: () => void; onOpen: () => void }) {
  const { study, row } = props;
  const m = study.matrix;
  const node = study.nodes.find((n) => n.id === row.nodeId);
  const level = (levels: Level[], v: number | null) => (v != null ? levels[v - 1] : undefined);
  const ls = (l: number | null, s: number | null) => {
    const a = level(m.likelihood, l);
    const b = level(m.severity, s);
    return a || b ? `L ${a?.code ?? "–"} · S ${b?.code ?? "–"}` : "";
  };

  const text = (label: string, value: string) =>
    value.trim() ? (
      <div className="sum-field">
        <div className="sum-label">{label}</div>
        <div className="sum-text">{value}</div>
      </div>
    ) : null;

  return (
    <aside className="summary-panel">
      <div className="sum-head">
        <div>
          <div className="muted">
            {props.reference} · {node?.name}
          </div>
          <div className="sum-title">{row.scenario || "No hazardous scenario"}</div>
        </div>
        <button className="icon-btn" title="Close" onClick={props.onClose}>×</button>
      </div>

      <div className="sum-risk">
        <div>
          <div className="sum-label">Current risk</div>
          <RiskBadge cls={riskClass(m, row.likelihood, row.severity)} />
          <div className="muted sum-ls">{ls(row.likelihood, row.severity)}</div>
        </div>
        <span className="sum-arrow">→</span>
        <div>
          <div className="sum-label">Residual risk</div>
          <RiskBadge cls={riskClass(m, row.residualLikelihood, row.residualSeverity)} />
          <div className="muted sum-ls">{ls(row.residualLikelihood, row.residualSeverity)}</div>
        </div>
      </div>

      {text("Hazard", row.hazard)}
      {text("Cause", row.cause)}
      {text("Consequence", row.consequence)}
      {text("Existing safeguards", row.safeguards)}
      {text("Recommendations", row.recommendations)}
      {row.recommendations.trim() && (
        <div className="sum-field">
          <div className="sum-label">Action</div>
          <div className="sum-text">
            {row.owner || "No owner"} · {row.status}
          </div>
        </div>
      )}
      {text("Comments", row.comments)}

      <button className="btn sum-open" onClick={props.onOpen}>
        Open in worksheet
      </button>
    </aside>
  );
}
