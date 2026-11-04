// Mirrors src-tauri/src/model.rs. Keep both in sync.

export interface Study {
  info: StudyInfo;
  team: TeamMember[];
  nodes: Node[];
  rows: Row[];
  /** The study's own copy of the risk database. */
  categories: RiskCategory[];
  matrix: RiskMatrix;
  /** Metadata only; the files themselves are held by the backend while the study is open. */
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  nodeId: string;
  name: string;
  mime: string;
  size: number;
  /** ISO 8601 date-time. */
  added: string;
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
  /** Name of a hazardous scenario from the risk database. */
  scenario: string;
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

export interface RiskCategory {
  id: string;
  name: string;
  scenarios: HazardousScenario[];
}

export interface HazardousScenario {
  id: string;
  name: string;
  description: string;
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
