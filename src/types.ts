// Mirrors src-tauri/src/model.rs. Keep both in sync.

export interface Study {
  info: StudyInfo;
  team: TeamMember[];
  nodes: Node[];
  rows: Row[];
  guidewords: Guideword[];
  matrix: RiskMatrix;
}

export interface StudyInfo {
  title: string;
  facility: string;
  reference: string;
  revision: string;
  date: string;
  facilitator: string;
  scribe: string;
  scope: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  organisation: string;
}

export interface Node {
  id: string;
  name: string;
  description: string;
  drawings: string;
}

export type Status = "Open" | "In progress" | "Closed";
export const STATUSES: Status[] = ["Open", "In progress", "Closed"];

export interface Row {
  id: string;
  nodeId: string;
  guideword: string;
  hazard: string;
  cause: string;
  consequence: string;
  safeguards: string;
  likelihood: number | null;
  severity: number | null;
  recommendations: string;
  residualLikelihood: number | null;
  residualSeverity: number | null;
  owner: string;
  status: Status | string;
  comments: string;
}

export interface Guideword {
  id: string;
  category: string;
  name: string;
  prompt: string;
}

export interface RiskMatrix {
  /** Lowest first: index 0 is level 1. */
  likelihood: Level[];
  /** Lowest first: index 0 is level 1. */
  severity: Level[];
  /** cells[l - 1][s - 1] is a risk class code. */
  cells: string[][];
  classes: RiskClass[];
}

export interface Level {
  code: string;
  label: string;
  description: string;
}

export interface RiskClass {
  code: string;
  label: string;
  color: string;
}
