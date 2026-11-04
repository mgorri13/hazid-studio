mod attachments;
mod database;
mod export;
mod menu;
mod model;
mod storage;

use std::path::PathBuf;

use attachments::Store;
use model::{Attachment, RiskCategory, RiskMatrix, Study};
use tauri::{AppHandle, Emitter, Manager, State};

/// Opening extracts attachments into a fresh store, which replaces the current one only if
/// the whole file was read, so a failed open leaves the current study intact.
#[tauri::command]
fn load_study(app: AppHandle, store: State<Store>, path: String) -> Result<Study, String> {
    let dir = attachments::new_dir(&app)?;
    match storage::load(&PathBuf::from(path), &dir) {
        Ok(study) => {
            store.replace(dir);
            Ok(study)
        }
        Err(e) => {
            let _ = std::fs::remove_dir_all(dir);
            Err(e)
        }
    }
}

#[tauri::command]
fn save_study(store: State<Store>, path: String, study: Study) -> Result<(), String> {
    storage::save(&PathBuf::from(path), &study, &store.dir())
}

/// Starts an empty store for a new study.
#[tauri::command]
fn reset_attachments(app: AppHandle, store: State<Store>) -> Result<(), String> {
    store.replace(attachments::new_dir(&app)?);
    Ok(())
}

#[tauri::command]
fn add_attachments(store: State<Store>, node_id: String, paths: Vec<String>) -> Result<Vec<Attachment>, String> {
    attachments::add(&store.dir(), &node_id, &paths)
}

#[tauri::command]
fn attachment_data_url(store: State<Store>, id: String, mime: String) -> Result<String, String> {
    attachments::data_url(&store.dir(), &id, &mime)
}

#[tauri::command]
fn open_attachment(app: AppHandle, store: State<Store>, id: String, name: String) -> Result<(), String> {
    attachments::open(&app, &store.dir(), &id, &name)
}

#[tauri::command]
fn export_attachment(store: State<Store>, id: String, path: String) -> Result<(), String> {
    attachments::export(&store.dir(), &id, &PathBuf::from(path))
}

#[tauri::command]
fn export_excel(path: String, study: Study) -> Result<(), String> {
    export::excel(&PathBuf::from(path), &study)
}

#[tauri::command]
fn load_risk_database(app: AppHandle) -> Result<Option<Vec<RiskCategory>>, String> {
    database::load_database(&app)
}

#[tauri::command]
fn save_risk_database(app: AppHandle, categories: Vec<RiskCategory>) -> Result<(), String> {
    database::save_database(&app, categories)
}

#[tauri::command]
fn load_default_matrix(app: AppHandle) -> Result<Option<RiskMatrix>, String> {
    database::load_matrix(&app)
}

#[tauri::command]
fn save_default_matrix(app: AppHandle, matrix: RiskMatrix) -> Result<(), String> {
    database::save_matrix(&app, matrix)
}

/// A `.hazid` path passed on the command line, e.g. when the OS opens the app via file association.
#[tauri::command]
fn launch_file() -> Option<String> {
    std::env::args().skip(1).find(|a| a.to_lowercase().ends_with(".hazid"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(attachments::init(app.handle())?);
            app.set_menu(menu::build(app.handle())?)?;
            Ok(())
        })
        // Menu actions are handled in the frontend, which owns the study state.
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            load_study,
            save_study,
            export_excel,
            load_risk_database,
            save_risk_database,
            load_default_matrix,
            save_default_matrix,
            reset_attachments,
            add_attachments,
            attachment_data_url,
            open_attachment,
            export_attachment,
            launch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXAMPLE: &str = include_str!("../tests-fixtures/example-study.json");

    #[test]
    fn save_load_roundtrip_and_export() {
        let study: Study = serde_json::from_str(EXAMPLE).unwrap();
        let dir = std::env::temp_dir().join(format!("hazid-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let blobs = dir.join("blobs");
        std::fs::create_dir_all(&blobs).unwrap();
        let mut study = study;
        let pdf = dir.join("P&ID 001.pdf");
        std::fs::write(&pdf, b"%PDF-1.4 fake").unwrap();
        study.attachments =
            attachments::add(&blobs, &study.nodes[0].id, &[pdf.to_string_lossy().into_owned()]).unwrap();

        let file = dir.join("example.hazid");
        storage::save(&file, &study, &blobs).unwrap();
        // Saving twice must replace the file, not fail on existing tables.
        storage::save(&file, &study, &blobs).unwrap();
        let reopened = dir.join("reopened");
        let loaded = storage::load(&file, &reopened).unwrap();
        assert_eq!(serde_json::to_value(&loaded).unwrap(), serde_json::to_value(&study).unwrap());
        let a = &loaded.attachments[0];
        assert_eq!((a.name.as_str(), a.mime.as_str(), a.size), ("P&ID 001.pdf", "application/pdf", 13));
        assert_eq!(std::fs::read(reopened.join(&a.id)).unwrap(), b"%PDF-1.4 fake");

        export::excel(&dir.join("example.xlsx"), &loaded).unwrap();
        println!("written to {}", dir.display());
    }

    #[test]
    fn opens_v1_files() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests-fixtures/v1-example.hazid");
        let study = storage::load(&path, &std::env::temp_dir().join("hazid-v1-blobs")).unwrap();
        assert!(study.attachments.is_empty());
        assert_eq!(study.categories.len(), 7);
        assert_eq!(study.categories[0].name, "Radiological");
        assert!(study.categories[0].scenarios.iter().any(|s| s.name == "Decay heat"));
        assert_eq!(study.rows[0].scenario, "Decay heat");
    }

    #[test]
    fn rejects_non_hazid_file() {
        let file = std::env::temp_dir().join(format!("not-hazid-{}.hazid", std::process::id()));
        std::fs::write(&file, "hello").unwrap();
        let blobs = std::env::temp_dir().join("hazid-bad-blobs");
        assert!(storage::load(&file, &blobs).unwrap_err().contains("not a valid .hazid file"));
    }
}
