//! The user's defaults, shared by all studies on this computer and stored as JSON in the
//! app data directory: the risk database (categories of hazardous scenarios) and the default
//! risk matrix. New studies take a copy of both, so `.hazid` files stay self-contained.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use tauri::{AppHandle, Manager};

use crate::model::{RiskCategory, RiskMatrix};

const DATABASE_FILE: &str = "risk-database.json";
const MATRIX_FILE: &str = "risk-matrix.json";
const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct VersionedFile<T> {
    version: u32,
    #[serde(alias = "categories")]
    data: T,
}

fn path(app: &AppHandle, file: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(file))
}

/// `None` when the user has never saved a database, so the frontend falls back to the defaults.
pub fn load_database(app: &AppHandle) -> Result<Option<Vec<RiskCategory>>, String> {
    read(&path(app, DATABASE_FILE)?, "risk database")
}

pub fn save_database(app: &AppHandle, categories: Vec<RiskCategory>) -> Result<(), String> {
    write(&path(app, DATABASE_FILE)?, categories, "risk database")
}

/// `None` when the user has never saved a default matrix.
pub fn load_matrix(app: &AppHandle) -> Result<Option<RiskMatrix>, String> {
    read(&path(app, MATRIX_FILE)?, "default risk matrix")
}

pub fn save_matrix(app: &AppHandle, matrix: RiskMatrix) -> Result<(), String> {
    write(&path(app, MATRIX_FILE)?, matrix, "default risk matrix")
}

fn read<T: DeserializeOwned>(path: &Path, what: &str) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| format!("Could not read the {what}: {e}"))?;
    let file: VersionedFile<T> =
        serde_json::from_str(&text).map_err(|e| format!("The {what} file is corrupt: {e}"))?;
    Ok(Some(file.data))
}

fn write<T: Serialize>(path: &Path, data: T, what: &str) -> Result<(), String> {
    let err = |e: std::io::Error| format!("Could not save the {what}: {e}");
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    let json = serde_json::to_string_pretty(&VersionedFile { version: VERSION, data })
        .expect("defaults are always serialisable");
    let tmp = path.with_extension("json.saving");
    fs::write(&tmp, json).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::HazardousScenario;

    #[test]
    fn roundtrip() {
        let dir = std::env::temp_dir().join(format!("hazid-db-{}", std::process::id()));
        let file = dir.join(DATABASE_FILE);
        assert!(read::<Vec<RiskCategory>>(&file, "db").unwrap().is_none());
        let cats = vec![RiskCategory {
            id: "c1".into(),
            name: "Custom".into(),
            scenarios: vec![HazardousScenario { id: "s1".into(), name: "Thing".into(), description: "".into() }],
        }];
        write(&file, cats, "db").unwrap();
        let loaded: Vec<RiskCategory> = read(&file, "db").unwrap().unwrap();
        assert_eq!(loaded[0].scenarios[0].name, "Thing");
    }

    #[test]
    fn reads_database_files_written_before_the_matrix_was_added() {
        let dir = std::env::temp_dir().join(format!("hazid-db-old-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(DATABASE_FILE);
        fs::write(&file, r#"{"version":1,"categories":[{"id":"c","name":"Old","scenarios":[]}]}"#).unwrap();
        let loaded: Vec<RiskCategory> = read(&file, "db").unwrap().unwrap();
        assert_eq!(loaded[0].name, "Old");
    }
}
