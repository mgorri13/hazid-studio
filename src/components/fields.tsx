import { useLayoutEffect, useRef } from "react";
import type { Level, RiskClass } from "../types";

/** Borderless textarea that grows with its content, used for worksheet cells. */
export function TextCell(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Extra class, e.g. `boxed` for a bordered field outside the worksheet. */
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      className={`cell-input ${props.className ?? ""}`}
      rows={1}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function LevelSelect(props: {
  levels: Level[];
  value: number | null;
  onChange: (v: number | null) => void;
  title: string;
}) {
  const current = props.value != null ? props.levels[props.value - 1] : undefined;
  // The closed control shows only the code; the native dropdown underneath lists full labels.
  return (
    <span className="level-select" title={current ? `${props.title}: ${current.code} — ${current.label}` : props.title}>
      <span className={current ? "" : "placeholder"}>{current?.code ?? "–"}</span>
      <select
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">–</option>
        {props.levels.map((lvl, i) => (
          <option key={i} value={i + 1}>
            {lvl.code} · {lvl.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function RiskBadge({ cls }: { cls?: RiskClass }) {
  if (!cls) return <span className="risk-badge empty">–</span>;
  return (
    <span className="risk-badge" style={{ background: cls.color }}>
      {cls.label}
    </span>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea rows={4} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input type={props.type ?? "text"} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </label>
  );
}
