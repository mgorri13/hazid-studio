import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Attachment, RiskCategory, RiskMatrix, Study } from "./types";

const HAZID_FILTER = [{ name: "HAZID study", extensions: ["hazid"] }];

export const loadStudy = (path: string) => invoke<Study>("load_study", { path });
export const saveStudy = (path: string, study: Study) => invoke<void>("save_study", { path, study });
export const exportExcel = (path: string, study: Study) => invoke<void>("export_excel", { path, study });
export const launchFile = () => invoke<string | null>("launch_file");
export const loadRiskDatabase = () => invoke<RiskCategory[] | null>("load_risk_database");
export const saveRiskDatabase = (categories: RiskCategory[]) => invoke<void>("save_risk_database", { categories });
export const resetAttachments = () => invoke<void>("reset_attachments");
export const addAttachments = (nodeId: string, paths: string[]) =>
  invoke<Attachment[]>("add_attachments", { nodeId, paths });
export const attachmentDataUrl = (a: Attachment) => invoke<string>("attachment_data_url", { id: a.id, mime: a.mime });
export const openAttachment = (a: Attachment) => invoke<void>("open_attachment", { id: a.id, name: a.name });
export const exportAttachment = (a: Attachment, path: string) => invoke<void>("export_attachment", { id: a.id, path });
export const loadDefaultMatrix = () => invoke<RiskMatrix | null>("load_default_matrix");
export const saveDefaultMatrix = (matrix: RiskMatrix) => invoke<void>("save_default_matrix", { matrix });

export async function pickOpenPath(): Promise<string | null> {
  const p = await open({ multiple: false, directory: false, filters: HAZID_FILTER });
  return typeof p === "string" ? p : null;
}

export async function pickAttachmentPaths(): Promise<string[]> {
  const p = await open({ multiple: true, directory: false, title: "Attach files" });
  return p ?? [];
}

export const pickSavePath = (defaultPath: string) => save({ defaultPath, filters: HAZID_FILTER });

export const pickExcelPath = (defaultPath: string) =>
  save({ defaultPath, filters: [{ name: "Excel workbook", extensions: ["xlsx"] }] });

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Turns a study title into a safe default file name. */
export const slug = (title: string) => title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "HAZID study";
