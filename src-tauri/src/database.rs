//! The global risk database: the user's library of risk categories and hazardous scenarios,
//! shared by all studies on this computer. Stored as JSON in the app data directory.
//! New studies take a copy of it, so `.hazid` files stay self-contained.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::model::RiskCategory;

const FILE_NAME: &str = "risk-database.json";
const VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct DatabaseFile {
    version: u32,
    categories: Vec<RiskCategory>,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

/// `None` when the user has never saved a database, so the frontend falls back to the defaults.
pub fn load(app: &AppHandle) -> Result<Option<Vec<RiskCategory>>, String> {
    read(&path(app)?)
}

pub fn save(app: &AppHandle, categories: Vec<RiskCategory>) -> Result<(), String> {
    write(&path(app)?, categories)
}

fn read(path: &Path) -> Result<Option<Vec<RiskCategory>>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| format!("Could not read the risk database: {e}"))?;
    let file: DatabaseFile =
        serde_json::from_str(&text).map_err(|e| format!("The risk database file is corrupt: {e}"))?;
    Ok(Some(file.categories))
}

fn write(path: &Path, categories: Vec<RiskCategory>) -> Result<(), String> {
    let err = |e: std::io::Error| format!("Could not save the risk database: {e}");
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    let json = serde_json::to_string_pretty(&DatabaseFile { version: VERSION, categories })
        .expect("risk database is always serialisable");
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
        let file = dir.join(FILE_NAME);
        assert!(read(&file).unwrap().is_none());
        let cats = vec![RiskCategory {
            id: "c1".into(),
            name: "Custom".into(),
            scenarios: vec![HazardousScenario { id: "s1".into(), name: "Thing".into(), description: "".into() }],
        }];
        write(&file, cats).unwrap();
        let loaded = read(&file).unwrap().unwrap();
        assert_eq!(loaded[0].scenarios[0].name, "Thing");
    }
}
