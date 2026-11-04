use serde::{Deserialize, Serialize};

/// A complete HAZID study. Mirrors `src/types.ts` on the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Study {
    pub info: StudyInfo,
    pub team: Vec<TeamMember>,
    pub nodes: Vec<Node>,
    pub rows: Vec<Row>,
    /// The study's own copy of the risk database (categories of hazardous scenarios).
    pub categories: Vec<RiskCategory>,
    pub matrix: RiskMatrix,
    /// Metadata only; file contents live in the attachment store while the study is open.
    #[serde(default)]
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub node_id: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
    /// ISO 8601 date-time.
    pub added: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StudyInfo {
    pub title: String,
    pub facility: String,
    pub reference: String,
    pub revision: String,
    pub date: String,
    pub facilitator: String,
    pub scribe: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: String,
    pub name: String,
    pub role: String,
    pub organisation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub name: String,
    pub description: String,
    pub drawings: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub id: String,
    pub node_id: String,
    /// Name of the hazardous scenario from the risk database.
    pub scenario: String,
    pub hazard: String,
    pub cause: String,
    pub consequence: String,
    pub safeguards: String,
    pub likelihood: Option<i64>,
    pub severity: Option<i64>,
    pub recommendations: String,
    pub residual_likelihood: Option<i64>,
    pub residual_severity: Option<i64>,
    pub owner: String,
    pub status: String,
    pub comments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskCategory {
    pub id: String,
    pub name: String,
    pub scenarios: Vec<HazardousScenario>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HazardousScenario {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskMatrix {
    /// Ordered from lowest (index 0 = level 1) to highest.
    pub likelihood: Vec<Level>,
    /// Ordered from lowest (index 0 = level 1) to highest.
    pub severity: Vec<Level>,
    /// `cells[l - 1][s - 1]` holds the risk class code for likelihood `l` and severity `s`.
    pub cells: Vec<Vec<String>>,
    pub classes: Vec<RiskClass>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    pub code: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskClass {
    pub code: String,
    pub label: String,
    /// Hex colour, e.g. `#d9f2e3`.
    pub color: String,
}

impl RiskMatrix {
    pub fn class_of(&self, likelihood: Option<i64>, severity: Option<i64>) -> Option<&RiskClass> {
        let (l, s) = (likelihood?, severity?);
        let code = self
            .cells
            .get(usize::try_from(l - 1).ok()?)?
            .get(usize::try_from(s - 1).ok()?)?;
        self.classes.iter().find(|c| &c.code == code)
    }

    pub fn likelihood_code(&self, l: Option<i64>) -> String {
        level_code(&self.likelihood, l)
    }

    pub fn severity_code(&self, s: Option<i64>) -> String {
        level_code(&self.severity, s)
    }
}

fn level_code(levels: &[Level], value: Option<i64>) -> String {
    value
        .and_then(|v| usize::try_from(v - 1).ok())
        .and_then(|i| levels.get(i))
        .map(|lvl| lvl.code.clone())
        .unwrap_or_default()
}

/// Reference such as `2.3` (node 2, third scenario of that node), in the order the rows appear.
pub fn row_refs(study: &Study) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    for (ni, node) in study.nodes.iter().enumerate() {
        let mut n = 0;
        for (ri, row) in study.rows.iter().enumerate() {
            if row.node_id == node.id {
                n += 1;
                out.push((ri, format!("{}.{}", ni + 1, n)));
            }
        }
    }
    out
}
