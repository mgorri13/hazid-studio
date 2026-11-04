mod database;
mod export;
mod menu;
mod model;
mod storage;

use std::path::PathBuf;

use model::{RiskCategory, Study};
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn load_study(path: String) -> Result<Study, String> {
    storage::load(&PathBuf::from(path))
}

#[tauri::command]
fn save_study(path: String, study: Study) -> Result<(), String> {
    storage::save(&PathBuf::from(path), &study)
}

#[tauri::command]
fn export_excel(path: String, study: Study) -> Result<(), String> {
    export::excel(&PathBuf::from(path), &study)
}

#[tauri::command]
fn load_risk_database(app: AppHandle) -> Result<Option<Vec<RiskCategory>>, String> {
    database::load(&app)
}

#[tauri::command]
fn save_risk_database(app: AppHandle, categories: Vec<RiskCategory>) -> Result<(), String> {
    database::save(&app, categories)
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
        .setup(|app| {
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

        let file = dir.join("example.hazid");
        storage::save(&file, &study).unwrap();
        // Saving twice must replace the file, not fail on existing tables.
        storage::save(&file, &study).unwrap();
        let loaded = storage::load(&file).unwrap();
        assert_eq!(serde_json::to_value(&loaded).unwrap(), serde_json::to_value(&study).unwrap());

        export::excel(&dir.join("example.xlsx"), &loaded).unwrap();
        println!("written to {}", dir.display());
    }

    #[test]
    fn opens_v1_files() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests-fixtures/v1-example.hazid");
        let study = storage::load(&path).unwrap();
        assert_eq!(study.categories.len(), 7);
        assert_eq!(study.categories[0].name, "Radiological");
        assert!(study.categories[0].scenarios.iter().any(|s| s.name == "Decay heat"));
        assert_eq!(study.rows[0].scenario, "Decay heat");
    }

    #[test]
    fn rejects_non_hazid_file() {
        let file = std::env::temp_dir().join(format!("not-hazid-{}.hazid", std::process::id()));
        std::fs::write(&file, "hello").unwrap();
        assert!(storage::load(&file).unwrap_err().contains("not a valid .hazid file"));
    }
}
