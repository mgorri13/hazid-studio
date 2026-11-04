import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Study } from "./types";

const HAZID_FILTER = [{ name: "HAZID study", extensions: ["hazid"] }];

export const loadStudy = (path: string) => invoke<Study>("load_study", { path });
export const saveStudy = (path: string, study: Study) => invoke<void>("save_study", { path, study });
export const exportExcel = (path: string, study: Study) => invoke<void>("export_excel", { path, study });
export const launchFile = () => invoke<string | null>("launch_file");

export async function pickOpenPath(): Promise<string | null> {
  const p = await open({ multiple: false, directory: false, filters: HAZID_FILTER });
  return typeof p === "string" ? p : null;
}

export const pickSavePath = (defaultPath: string) => save({ defaultPath, filters: HAZID_FILTER });

export const pickExcelPath = (defaultPath: string) =>
  save({ defaultPath, filters: [{ name: "Excel workbook", extensions: ["xlsx"] }] });

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Turns a study title into a safe default file name. */
export const slug = (title: string) => title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "HAZID study";
