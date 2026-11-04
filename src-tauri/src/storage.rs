//! `.hazid` files are SQLite databases. Saving writes a fresh database next to the
//! target and renames it over the original, so a crash never leaves a half-written study.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, params};

use crate::model::{Attachment, HazardousScenario, Node, RiskCategory, Row, Study, TeamMember};

/// v1: flat `guidewords` table, `rows.guideword`.
/// v2: `categories` + `scenarios` tables, `rows.scenario`.
/// v3: `attachments` table holding node files as blobs.
pub const SCHEMA_VERSION: i64 = 3;

const SCHEMA: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE team (
    id TEXT PRIMARY KEY, position INTEGER NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL, organisation TEXT NOT NULL
);
CREATE TABLE nodes (
    id TEXT PRIMARY KEY, position INTEGER NOT NULL,
    name TEXT NOT NULL, description TEXT NOT NULL, drawings TEXT NOT NULL
);
CREATE TABLE categories (
    id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL
);
CREATE TABLE scenarios (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL, position INTEGER NOT NULL,
    name TEXT NOT NULL, description TEXT NOT NULL
);
CREATE TABLE rows (
    id TEXT PRIMARY KEY, position INTEGER NOT NULL,
    node_id TEXT NOT NULL, scenario TEXT NOT NULL,
    hazard TEXT NOT NULL, cause TEXT NOT NULL, consequence TEXT NOT NULL, safeguards TEXT NOT NULL,
    likelihood INTEGER, severity INTEGER,
    recommendations TEXT NOT NULL,
    residual_likelihood INTEGER, residual_severity INTEGER,
    owner TEXT NOT NULL, status TEXT NOT NULL, comments TEXT NOT NULL
);
CREATE TABLE attachments (
    id TEXT PRIMARY KEY, position INTEGER NOT NULL, node_id TEXT NOT NULL,
    name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, added TEXT NOT NULL,
    data BLOB NOT NULL
);
";

/// `blobs` is the attachment store: a folder holding each attachment's contents under its id.
pub fn save(path: &Path, study: &Study, blobs: &Path) -> Result<(), String> {
    let tmp = tmp_path(path);
    let _ = fs::remove_file(&tmp);
    write_db(&tmp, study, blobs).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save study: {e}")
    })?;
    fs::rename(&tmp, path).map_err(|e| format!("Could not save study: {e}"))
}

/// Reads a study and extracts its attachment contents into `blobs`.
pub fn load(path: &Path, blobs: &Path) -> Result<Study, String> {
    read_db(path, blobs).map_err(|e| format!("Could not open study: {e}"))
}

enum LoadError {
    Db(rusqlite::Error),
    Format(String),
    Io(std::io::Error),
}

impl From<std::io::Error> for LoadError {
    fn from(e: std::io::Error) -> Self {
        LoadError::Io(e)
    }
}

impl From<rusqlite::Error> for LoadError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::SqliteFailure(..) => LoadError::Format("not a valid .hazid file".into()),
            other => LoadError::Db(other),
        }
    }
}

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoadError::Db(e) => write!(f, "{e}"),
            LoadError::Format(msg) => f.write_str(msg),
            LoadError::Io(e) => write!(f, "{e}"),
        }
    }
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".saving");
    path.with_file_name(name)
}

fn write_db(path: &Path, study: &Study, blobs: &Path) -> Result<(), String> {
    write_db_inner(path, study, blobs).map_err(|e| e.to_string())
}

fn write_db_inner(path: &Path, study: &Study, blobs: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    let tx = conn.transaction()?;
    {
        let mut meta = tx.prepare("INSERT INTO meta (key, value) VALUES (?1, ?2)")?;
        meta.execute(params!["schema_version", SCHEMA_VERSION.to_string()])?;
        meta.execute(params!["info", to_json(&study.info)])?;
        meta.execute(params!["matrix", to_json(&study.matrix)])?;

        let mut team = tx.prepare("INSERT INTO team VALUES (?1, ?2, ?3, ?4, ?5)")?;
        for (i, m) in study.team.iter().enumerate() {
            team.execute(params![m.id, i, m.name, m.role, m.organisation])?;
        }

        let mut nodes = tx.prepare("INSERT INTO nodes VALUES (?1, ?2, ?3, ?4, ?5)")?;
        for (i, n) in study.nodes.iter().enumerate() {
            nodes.execute(params![n.id, i, n.name, n.description, n.drawings])?;
        }

        let mut cats = tx.prepare("INSERT INTO categories VALUES (?1, ?2, ?3)")?;
        let mut scens = tx.prepare("INSERT INTO scenarios VALUES (?1, ?2, ?3, ?4, ?5)")?;
        for (i, c) in study.categories.iter().enumerate() {
            cats.execute(params![c.id, i, c.name])?;
            for (j, sc) in c.scenarios.iter().enumerate() {
                scens.execute(params![sc.id, c.id, j, sc.name, sc.description])?;
            }
        }

        let mut rows = tx.prepare(
            "INSERT INTO rows VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        )?;
        for (i, r) in study.rows.iter().enumerate() {
            rows.execute(params![
                r.id,
                i,
                r.node_id,
                r.scenario,
                r.hazard,
                r.cause,
                r.consequence,
                r.safeguards,
                r.likelihood,
                r.severity,
                r.recommendations,
                r.residual_likelihood,
                r.residual_severity,
                r.owner,
                r.status,
                r.comments
            ])?;
        }

        let mut atts = tx.prepare("INSERT INTO attachments VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")?;
        for (i, a) in study.attachments.iter().enumerate() {
            let data = fs::read(blobs.join(&a.id)).map_err(|e| format!("attachment \"{}\" is missing: {e}", a.name))?;
            atts.execute(params![a.id, i, a.node_id, a.name, a.mime, a.size as i64, a.added, data])?;
        }
    }
    tx.commit()?;
    conn.close().map_err(|(_, e)| e)?;
    Ok(())
}

fn read_db(path: &Path, blobs: &Path) -> Result<Study, LoadError> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    let meta = |key: &str| -> Result<String, LoadError> {
        Ok(conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))?)
    };
    let version: i64 = meta("schema_version")?.parse().unwrap_or(0);
    if version > SCHEMA_VERSION {
        return Err(LoadError::Format(format!(
            "this file was created by a newer version of HAZID Studio (schema {version})"
        )));
    }
    let info = from_json(&meta("info")?)?;
    let matrix = from_json(&meta("matrix")?)?;

    let team = conn
        .prepare("SELECT id, name, role, organisation FROM team ORDER BY position")?
        .query_map([], |r| {
            Ok(TeamMember { id: r.get(0)?, name: r.get(1)?, role: r.get(2)?, organisation: r.get(3)? })
        })?
        .collect::<Result<_, _>>()?;

    let nodes = conn
        .prepare("SELECT id, name, description, drawings FROM nodes ORDER BY position")?
        .query_map([], |r| {
            Ok(Node { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, drawings: r.get(3)? })
        })?
        .collect::<Result<_, _>>()?;

    let categories = if version >= 2 { read_categories(&conn)? } else { read_v1_guidewords(&conn)? };
    let scenario_col = if version >= 2 { "scenario" } else { "guideword" };

    let rows = conn
        .prepare(&format!(
            "SELECT id, node_id, {scenario_col}, hazard, cause, consequence, safeguards, likelihood, severity,
                    recommendations, residual_likelihood, residual_severity, owner, status, comments
             FROM rows ORDER BY position"
        ))?
        .query_map([], |r| {
            Ok(Row {
                id: r.get(0)?,
                node_id: r.get(1)?,
                scenario: r.get(2)?,
                hazard: r.get(3)?,
                cause: r.get(4)?,
                consequence: r.get(5)?,
                safeguards: r.get(6)?,
                likelihood: r.get(7)?,
                severity: r.get(8)?,
                recommendations: r.get(9)?,
                residual_likelihood: r.get(10)?,
                residual_severity: r.get(11)?,
                owner: r.get(12)?,
                status: r.get(13)?,
                comments: r.get(14)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    let attachments = if version >= 3 { read_attachments(&conn, blobs)? } else { Vec::new() };

    Ok(Study { info, team, nodes, rows, categories, matrix, attachments })
}

fn read_attachments(conn: &Connection, blobs: &Path) -> Result<Vec<Attachment>, LoadError> {
    fs::create_dir_all(blobs)?;
    let mut stmt =
        conn.prepare("SELECT id, node_id, name, mime, size, added, data FROM attachments ORDER BY position")?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let a = Attachment {
            id: r.get(0)?,
            node_id: r.get(1)?,
            name: r.get(2)?,
            mime: r.get(3)?,
            size: r.get::<_, i64>(4)? as u64,
            added: r.get(5)?,
        };
        let data: Vec<u8> = r.get(6)?;
        fs::write(blobs.join(&a.id), data)?;
        out.push(a);
    }
    Ok(out)
}

fn read_categories(conn: &Connection) -> Result<Vec<RiskCategory>, LoadError> {
    let mut categories: Vec<RiskCategory> = conn
        .prepare("SELECT id, name FROM categories ORDER BY position")?
        .query_map([], |r| Ok(RiskCategory { id: r.get(0)?, name: r.get(1)?, scenarios: Vec::new() }))?
        .collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare("SELECT category_id, id, name, description FROM scenarios ORDER BY position")?;
    let scenarios = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, HazardousScenario { id: r.get(1)?, name: r.get(2)?, description: r.get(3)? }))
    })?;
    for item in scenarios {
        let (category_id, scenario) = item?;
        if let Some(c) = categories.iter_mut().find(|c| c.id == category_id) {
            c.scenarios.push(scenario);
        }
    }
    Ok(categories)
}

/// v1 stored a flat guideword list with the category name on each entry.
fn read_v1_guidewords(conn: &Connection) -> Result<Vec<RiskCategory>, LoadError> {
    let mut categories: Vec<RiskCategory> = Vec::new();
    let mut stmt = conn.prepare("SELECT id, category, name, prompt FROM guidewords ORDER BY position")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(1)?,
            HazardousScenario { id: r.get(0)?, name: r.get(2)?, description: r.get(3)? },
        ))
    })?;
    for item in rows {
        let (category, scenario) = item?;
        match categories.iter_mut().find(|c| c.name == category) {
            Some(c) => c.scenarios.push(scenario),
            None => categories.push(RiskCategory {
                id: format!("v1-{}", categories.len()),
                name: category,
                scenarios: vec![scenario],
            }),
        }
    }
    Ok(categories)
}

fn to_json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("study metadata is always serialisable")
}

fn from_json<T: serde::de::DeserializeOwned>(s: &str) -> Result<T, LoadError> {
    serde_json::from_str(s).map_err(|e| LoadError::Format(format!("corrupt study metadata: {e}")))
}
