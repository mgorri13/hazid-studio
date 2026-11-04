//! Attachment store. While a study is open, the contents of its attachments live as files in a
//! folder of the app cache (one file per attachment id); only metadata travels to the frontend.
//! Saving copies them into the `.hazid` file and opening extracts them into a fresh store.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::model::Attachment;

pub struct Store(Mutex<PathBuf>);

impl Store {
    pub fn dir(&self) -> PathBuf {
        self.0.lock().unwrap().clone()
    }

    /// Makes `dir` the current store and deletes the previous one.
    pub fn replace(&self, dir: PathBuf) {
        let old = std::mem::replace(&mut *self.0.lock().unwrap(), dir);
        let _ = fs::remove_dir_all(old);
    }
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("attachments"))
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_id() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    format!("{nanos:x}-{:x}-{:x}", std::process::id(), COUNTER.fetch_add(1, Ordering::Relaxed))
}

/// A new, empty store folder.
pub fn new_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = root(app)?.join(unique_id());
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create the attachment folder: {e}"))?;
    Ok(dir)
}

/// Creates the store for the startup study and removes stores left behind by old sessions.
pub fn init(app: &AppHandle) -> Result<Store, String> {
    if let Ok(entries) = fs::read_dir(root(app)?) {
        let week = Duration::from_secs(7 * 24 * 3600);
        for entry in entries.flatten() {
            let stale = entry.metadata().and_then(|m| m.modified()).map(|t| t.elapsed().unwrap_or_default() > week);
            if stale.unwrap_or(false) {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok(Store(Mutex::new(new_dir(app)?)))
}

pub fn mime_for(name: &str) -> &'static str {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "dwg" => "image/vnd.dwg",
        "dxf" => "image/vnd.dxf",
        _ => "application/octet-stream",
    }
}

fn now_iso() -> String {
    // Seconds since the epoch rendered as UTC, without pulling in a date library.
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let (h, m, s) = (rem / 3600, rem % 3600 / 60, rem % 60);
    // Civil-from-days algorithm (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(mo <= 2);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

/// Copies files into the store and returns their metadata.
pub fn add(store: &Path, node_id: &str, paths: &[String]) -> Result<Vec<Attachment>, String> {
    paths
        .iter()
        .map(|p| {
            let src = Path::new(p);
            let name = src.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
            let id = unique_id();
            let size = fs::copy(src, store.join(&id)).map_err(|e| format!("Could not attach \"{name}\": {e}"))?;
            Ok(Attachment {
                id,
                node_id: node_id.to_string(),
                mime: mime_for(&name).to_string(),
                name,
                size,
                added: now_iso(),
            })
        })
        .collect()
}

pub fn data_url(store: &Path, id: &str, mime: &str) -> Result<String, String> {
    let bytes = fs::read(store.join(id)).map_err(|e| format!("Could not read attachment: {e}"))?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Opens an attachment with the operating system's default program. The file is copied under
/// its original name first, so the right program is picked and its title bar reads sensibly.
pub fn open(app: &AppHandle, store: &Path, id: &str, name: &str) -> Result<(), String> {
    let safe: String = name.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c }).collect();
    let dir = store.join("open").join(id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(safe);
    fs::copy(store.join(id), &target).map_err(|e| format!("Could not open attachment: {e}"))?;
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Could not open attachment: {e}"))
}

/// Writes a copy of an attachment to a path the user chose.
pub fn export(store: &Path, id: &str, dest: &Path) -> Result<(), String> {
    fs::copy(store.join(id), dest).map(|_| ()).map_err(|e| format!("Could not save attachment: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates() {
        let s = now_iso();
        assert_eq!(s.len(), 20);
        assert!(s.starts_with("20") && s.ends_with('Z'));
    }

    #[test]
    fn mime_types() {
        assert_eq!(mime_for("P&ID-001.PDF"), "application/pdf");
        assert_eq!(mime_for("layout.jpeg"), "image/jpeg");
        assert_eq!(mime_for("notes"), "application/octet-stream");
    }
}
