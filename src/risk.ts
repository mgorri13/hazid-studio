import type { RiskClass, RiskMatrix, Study } from "./types";

export function riskClass(m: RiskMatrix, l: number | null, s: number | null): RiskClass | undefined {
  if (l == null || s == null) return undefined;
  const code = m.cells[l - 1]?.[s - 1];
  return m.classes.find((c) => c.code === code);
}

/** Reference ("2.3") for every row id, numbered per node in display order. */
export function rowRefs(study: Study): Map<string, string> {
  const refs = new Map<string, string>();
  study.nodes.forEach((node, ni) => {
    let n = 0;
    for (const row of study.rows) if (row.nodeId === node.id) refs.set(row.id, `${ni + 1}.${++n}`);
  });
  return refs;
}
