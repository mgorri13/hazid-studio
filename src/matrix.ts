// Pure edits of a risk matrix, and of a study's ratings when its matrix changes shape.
import { uid } from "./defaults";
import type { Level, RiskClass, RiskMatrix, Row, Study } from "./types";

export type Axis = "likelihood" | "severity";

/** Next code following the pattern of the existing ones: A, B, C → D; 1, 2, 3 → 4. */
function nextCode(levels: Level[]): string {
  const codes = levels.map((l) => l.code.trim());
  if (codes.length && codes.every((c) => /^[A-Z]$/.test(c))) {
    return String.fromCharCode(Math.max(...codes.map((c) => c.charCodeAt(0))) + 1);
  }
  if (codes.length && codes.every((c) => /^\d+$/.test(c))) return String(Math.max(...codes.map(Number)) + 1);
  return String(levels.length + 1);
}

/** Adds a level above the current highest; its cells copy the highest level's classes. */
export function addLevel(m: RiskMatrix, axis: Axis): RiskMatrix {
  const level: Level = { code: nextCode(m[axis]), label: "New level", description: "" };
  const fallback = m.classes[0]?.code ?? "";
  const cells =
    axis === "likelihood"
      ? [...m.cells, [...(m.cells[m.cells.length - 1] ?? m.severity.map(() => fallback))]]
      : m.cells.map((row) => [...row, row[row.length - 1] ?? fallback]);
  return { ...m, [axis]: [...m[axis], level], cells };
}

export function removeLevel(m: RiskMatrix, axis: Axis, index: number): RiskMatrix {
  const cells =
    axis === "likelihood" ? m.cells.filter((_, i) => i !== index) : m.cells.map((row) => row.filter((_, j) => j !== index));
  return { ...m, [axis]: m[axis].filter((_, i) => i !== index), cells };
}

export function updateLevel(m: RiskMatrix, axis: Axis, index: number, patch: Partial<Level>): RiskMatrix {
  return { ...m, [axis]: m[axis].map((l, i) => (i === index ? { ...l, ...patch } : l)) };
}

const ratingFields = (axis: Axis) =>
  axis === "likelihood" ? (["likelihood", "residualLikelihood"] as const) : (["severity", "residualSeverity"] as const);

/** Rows rated with level `index` (0-based) on this axis, current or residual. */
export const rowsUsingLevel = (rows: Row[], axis: Axis, index: number) =>
  rows.filter((r) => ratingFields(axis).some((f) => r[f] === index + 1)).length;

/** Removes a level from a study's matrix: ratings on it are cleared, higher ratings shift down. */
export function removeLevelFromStudy(study: Study, axis: Axis, index: number): Study {
  const level = index + 1;
  const remap = (v: number | null) => (v == null || v === level ? null : v > level ? v - 1 : v);
  const [a, b] = ratingFields(axis);
  return {
    ...study,
    matrix: removeLevel(study.matrix, axis, index),
    rows: study.rows.map((r) => ({ ...r, [a]: remap(r[a]), [b]: remap(r[b]) })),
  };
}

const outOfRange = (m: RiskMatrix, r: Row) => {
  const bad = (v: number | null, n: number) => v != null && v > n;
  return (
    bad(r.likelihood, m.likelihood.length) ||
    bad(r.residualLikelihood, m.likelihood.length) ||
    bad(r.severity, m.severity.length) ||
    bad(r.residualSeverity, m.severity.length)
  );
};

/** Rows whose ratings do not fit in matrix `m`. */
export const rowsOutOfRange = (rows: Row[], m: RiskMatrix) => rows.filter((r) => outOfRange(m, r)).length;

/** Replaces a study's matrix, clearing any rating that does not exist in the new one. */
export function applyMatrixToStudy(study: Study, m: RiskMatrix): Study {
  const fit = (v: number | null, n: number) => (v != null && v > n ? null : v);
  return {
    ...study,
    matrix: structuredClone(m),
    rows: study.rows.map((r) => ({
      ...r,
      likelihood: fit(r.likelihood, m.likelihood.length),
      residualLikelihood: fit(r.residualLikelihood, m.likelihood.length),
      severity: fit(r.severity, m.severity.length),
      residualSeverity: fit(r.residualSeverity, m.severity.length),
    })),
  };
}

/** In a cell, cycles to the next risk class in the order the classes are listed. */
export function cycleCell(m: RiskMatrix, li: number, si: number): RiskMatrix {
  const order = m.classes.map((c) => c.code);
  const next = order[(order.indexOf(m.cells[li][si]) + 1) % order.length];
  return { ...m, cells: m.cells.map((row, i) => (i === li ? row.map((c, j) => (j === si ? next : c)) : row)) };
}

export function addClass(m: RiskMatrix): RiskMatrix {
  return { ...m, classes: [...m.classes, { code: uid().slice(0, 8), label: "New class", color: "#e4e4e7" }] };
}

export function updateClass(m: RiskMatrix, code: string, patch: Partial<RiskClass>): RiskMatrix {
  return { ...m, classes: m.classes.map((c) => (c.code === code ? { ...c, ...patch } : c)) };
}

/** Removes a class; cells that used it take the first remaining class. */
export function removeClass(m: RiskMatrix, code: string): RiskMatrix {
  const classes = m.classes.filter((c) => c.code !== code);
  const fallback = classes[0]?.code ?? "";
  return { ...m, classes, cells: m.cells.map((row) => row.map((c) => (c === code ? fallback : c))) };
}

export function moveClass(m: RiskMatrix, code: string, dir: -1 | 1): RiskMatrix {
  const i = m.classes.findIndex((c) => c.code === code);
  const j = i + dir;
  if (j < 0 || j >= m.classes.length) return m;
  const classes = [...m.classes];
  [classes[i], classes[j]] = [classes[j], classes[i]];
  return { ...m, classes };
}
