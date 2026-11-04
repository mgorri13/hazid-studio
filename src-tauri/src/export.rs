use std::collections::HashMap;
use std::path::Path;

use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet, XlsxError};

use crate::model::{RiskClass, Study, row_refs};

const HEADER_BG: u32 = 0x1F2937;
const NODE_BG: u32 = 0xF3F4F6;
const GRID: u32 = 0xD1D5DB;

pub fn excel(path: &Path, study: &Study) -> Result<(), String> {
    build(study)
        .and_then(|mut wb| wb.save(path))
        .map_err(|e| format!("Could not export to Excel: {e}"))
}

fn build(study: &Study) -> Result<Workbook, XlsxError> {
    let mut wb = Workbook::new();
    wb.push_worksheet(study_sheet(study)?);
    wb.push_worksheet(worksheet_sheet(study)?);
    wb.push_worksheet(actions_sheet(study)?);
    wb.push_worksheet(matrix_sheet(study)?);
    wb.push_worksheet(risk_database_sheet(study)?);
    Ok(wb)
}

struct Formats {
    title: Format,
    header: Format,
    label: Format,
    cell: Format,
    center: Format,
    node: Format,
}

impl Formats {
    fn new() -> Self {
        let cell = Format::new()
            .set_text_wrap()
            .set_align(FormatAlign::Top)
            .set_border(FormatBorder::Thin)
            .set_border_color(Color::RGB(GRID))
            .set_font_size(10);
        Formats {
            title: Format::new().set_bold().set_font_size(16),
            header: Format::new()
                .set_bold()
                .set_font_size(10)
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(HEADER_BG))
                .set_text_wrap()
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin)
                .set_border_color(Color::RGB(GRID)),
            label: Format::new().set_bold().set_font_size(10).set_align(FormatAlign::Top),
            center: cell.clone().set_align(FormatAlign::Center),
            node: cell.clone().set_bold().set_background_color(Color::RGB(NODE_BG)),
            cell,
        }
    }

    fn risk(&self, class: Option<&RiskClass>) -> Format {
        match class.and_then(|c| parse_hex(&c.color)) {
            Some(rgb) => self.center.clone().set_bold().set_background_color(Color::RGB(rgb)),
            None => self.center.clone(),
        }
    }
}

fn parse_hex(hex: &str) -> Option<u32> {
    u32::from_str_radix(hex.trim_start_matches('#'), 16).ok()
}

fn headers(ws: &mut Worksheet, row: u32, cols: &[(&str, f64)], f: &Formats) -> Result<(), XlsxError> {
    for (c, (name, width)) in cols.iter().enumerate() {
        let c = c as u16;
        ws.write_string_with_format(row, c, *name, &f.header)?;
        ws.set_column_width(c, *width)?;
    }
    ws.set_row_height(row, 28)?;
    Ok(())
}

fn study_sheet(study: &Study) -> Result<Worksheet, XlsxError> {
    let f = Formats::new();
    let mut ws = Worksheet::new();
    ws.set_name("Study")?;
    ws.set_column_width(0, 22)?;
    ws.set_column_width(1, 70)?;
    ws.set_column_width(2, 30)?;
    ws.set_column_width(3, 40)?;

    let title = if study.info.title.is_empty() { "HAZID Study" } else { &study.info.title };
    ws.write_string_with_format(0, 0, title, &f.title)?;

    let i = &study.info;
    let fields = [
        ("Facility", &i.facility),
        ("Reference", &i.reference),
        ("Revision", &i.revision),
        ("Date", &i.date),
        ("Facilitator", &i.facilitator),
        ("Scribe", &i.scribe),
        ("Scope", &i.scope),
    ];
    let mut r = 2;
    for (label, value) in fields {
        ws.write_string_with_format(r, 0, label, &f.label)?;
        ws.write_string_with_format(r, 1, value.as_str(), &f.cell)?;
        r += 1;
    }

    r += 1;
    ws.write_string_with_format(r, 0, "Team", &f.label)?;
    r += 1;
    for (c, name) in ["Name", "Role", "Organisation"].iter().enumerate() {
        ws.write_string_with_format(r, c as u16, *name, &f.header)?;
    }
    for m in &study.team {
        r += 1;
        ws.write_string_with_format(r, 0, &m.name, &f.cell)?;
        ws.write_string_with_format(r, 1, &m.role, &f.cell)?;
        ws.write_string_with_format(r, 2, &m.organisation, &f.cell)?;
    }

    r += 2;
    ws.write_string_with_format(r, 0, "Nodes", &f.label)?;
    r += 1;
    for (c, name) in ["Node", "Description", "Drawings", "Attachments"].iter().enumerate() {
        ws.write_string_with_format(r, c as u16, *name, &f.header)?;
    }
    for (n, node) in study.nodes.iter().enumerate() {
        r += 1;
        ws.write_string_with_format(r, 0, format!("{}. {}", n + 1, node.name), &f.cell)?;
        ws.write_string_with_format(r, 1, &node.description, &f.cell)?;
        ws.write_string_with_format(r, 2, &node.drawings, &f.cell)?;
        let files: Vec<&str> =
            study.attachments.iter().filter(|a| a.node_id == node.id).map(|a| a.name.as_str()).collect();
        ws.write_string_with_format(r, 3, files.join("\n"), &f.cell)?;
    }
    Ok(ws)
}

fn worksheet_sheet(study: &Study) -> Result<Worksheet, XlsxError> {
    let f = Formats::new();
    let m = &study.matrix;
    let mut ws = Worksheet::new();
    ws.set_name("HAZID Worksheet")?;
    let cols = [
        ("Ref", 6.0),
        ("Hazardous scenario", 20.0),
        ("Hazard", 26.0),
        ("Cause", 30.0),
        ("Consequence", 30.0),
        ("Existing safeguards", 30.0),
        ("L", 5.0),
        ("S", 5.0),
        ("Risk", 9.0),
        ("Recommendations", 32.0),
        ("Res. L", 6.0),
        ("Res. S", 6.0),
        ("Res. risk", 9.0),
        ("Owner", 14.0),
        ("Status", 11.0),
        ("Comments", 24.0),
    ];
    headers(&mut ws, 0, &cols, &f)?;
    let last_col = (cols.len() - 1) as u16;

    let refs: HashMap<usize, String> = row_refs(study).into_iter().collect();
    let mut r = 0u32;
    for (ni, node) in study.nodes.iter().enumerate() {
        r += 1;
        let title = if node.description.is_empty() {
            format!("Node {}: {}", ni + 1, node.name)
        } else {
            format!("Node {}: {} — {}", ni + 1, node.name, node.description)
        };
        ws.merge_range(r, 0, r, last_col, &title, &f.node)?;

        for (ri, row) in study.rows.iter().enumerate().filter(|(_, x)| x.node_id == node.id) {
            r += 1;
            let risk = m.class_of(row.likelihood, row.severity);
            let res = m.class_of(row.residual_likelihood, row.residual_severity);
            ws.write_string_with_format(r, 0, refs.get(&ri).map(String::as_str).unwrap_or(""), &f.center)?;
            ws.write_string_with_format(r, 1, &row.scenario, &f.cell)?;
            ws.write_string_with_format(r, 2, &row.hazard, &f.cell)?;
            ws.write_string_with_format(r, 3, &row.cause, &f.cell)?;
            ws.write_string_with_format(r, 4, &row.consequence, &f.cell)?;
            ws.write_string_with_format(r, 5, &row.safeguards, &f.cell)?;
            ws.write_string_with_format(r, 6, m.likelihood_code(row.likelihood), &f.center)?;
            ws.write_string_with_format(r, 7, m.severity_code(row.severity), &f.center)?;
            ws.write_string_with_format(r, 8, risk.map(|c| c.label.as_str()).unwrap_or(""), &f.risk(risk))?;
            ws.write_string_with_format(r, 9, &row.recommendations, &f.cell)?;
            ws.write_string_with_format(r, 10, m.likelihood_code(row.residual_likelihood), &f.center)?;
            ws.write_string_with_format(r, 11, m.severity_code(row.residual_severity), &f.center)?;
            ws.write_string_with_format(r, 12, res.map(|c| c.label.as_str()).unwrap_or(""), &f.risk(res))?;
            ws.write_string_with_format(r, 13, &row.owner, &f.cell)?;
            ws.write_string_with_format(r, 14, &row.status, &f.cell)?;
            ws.write_string_with_format(r, 15, &row.comments, &f.cell)?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    ws.set_landscape();
    ws.set_repeat_rows(0, 0)?;
    Ok(ws)
}

fn actions_sheet(study: &Study) -> Result<Worksheet, XlsxError> {
    let f = Formats::new();
    let m = &study.matrix;
    let mut ws = Worksheet::new();
    ws.set_name("Actions")?;
    let cols = [
        ("Ref", 6.0),
        ("Node", 20.0),
        ("Hazard", 30.0),
        ("Recommendation", 50.0),
        ("Owner", 16.0),
        ("Status", 12.0),
        ("Risk", 9.0),
        ("Res. risk", 9.0),
    ];
    headers(&mut ws, 0, &cols, &f)?;

    let mut r = 0u32;
    for (ri, reference) in row_refs(study) {
        let row = &study.rows[ri];
        if row.recommendations.trim().is_empty() {
            continue;
        }
        r += 1;
        let node = study.nodes.iter().find(|n| n.id == row.node_id).map(|n| n.name.as_str()).unwrap_or("");
        let risk = m.class_of(row.likelihood, row.severity);
        let res = m.class_of(row.residual_likelihood, row.residual_severity);
        ws.write_string_with_format(r, 0, &reference, &f.center)?;
        ws.write_string_with_format(r, 1, node, &f.cell)?;
        ws.write_string_with_format(r, 2, &row.hazard, &f.cell)?;
        ws.write_string_with_format(r, 3, &row.recommendations, &f.cell)?;
        ws.write_string_with_format(r, 4, &row.owner, &f.cell)?;
        ws.write_string_with_format(r, 5, &row.status, &f.cell)?;
        ws.write_string_with_format(r, 6, risk.map(|c| c.label.as_str()).unwrap_or(""), &f.risk(risk))?;
        ws.write_string_with_format(r, 7, res.map(|c| c.label.as_str()).unwrap_or(""), &f.risk(res))?;
    }
    if r > 0 {
        ws.autofilter(0, 0, r, (cols.len() - 1) as u16)?;
    }
    ws.set_freeze_panes(1, 0)?;
    Ok(ws)
}

fn matrix_sheet(study: &Study) -> Result<Worksheet, XlsxError> {
    let f = Formats::new();
    let m = &study.matrix;
    let mut ws = Worksheet::new();
    ws.set_name("Risk Map")?;
    ws.set_column_width(0, 26)?;
    for c in 1..=m.severity.len() as u16 {
        ws.set_column_width(c, 16)?;
    }

    ws.write_string_with_format(0, 0, "Risk map — scenarios per cell (current / residual)", &f.title)?;

    // Likelihood rows are listed from highest to lowest, as matrices are usually drawn.
    let top = 2u32;
    ws.write_string_with_format(top, 0, "Likelihood \\ Severity", &f.header)?;
    for (si, s) in m.severity.iter().enumerate() {
        ws.write_string_with_format(top, si as u16 + 1, format!("{} {}", s.code, s.label), &f.header)?;
    }
    for (offset, li) in (0..m.likelihood.len()).rev().enumerate() {
        let r = top + 1 + offset as u32;
        let l = &m.likelihood[li];
        ws.write_string_with_format(r, 0, format!("{} {}", l.code, l.label), &f.header)?;
        for si in 0..m.severity.len() {
            let (lv, sv) = (Some(li as i64 + 1), Some(si as i64 + 1));
            let current = study.rows.iter().filter(|x| x.likelihood == lv && x.severity == sv).count();
            let residual = study
                .rows
                .iter()
                .filter(|x| x.residual_likelihood == lv && x.residual_severity == sv)
                .count();
            let class = m.class_of(lv, sv);
            let text = format!("{current} / {residual}");
            ws.write_string_with_format(r, si as u16 + 1, &text, &f.risk(class))?;
        }
        ws.set_row_height(r, 30)?;
    }

    let mut r = top + m.likelihood.len() as u32 + 3;
    for (title, levels) in [("Likelihood", &m.likelihood), ("Severity", &m.severity)] {
        ws.write_string_with_format(r, 0, title, &f.header)?;
        ws.merge_range(r, 1, r, m.severity.len() as u16, "Description", &f.header)?;
        for lvl in levels {
            r += 1;
            ws.write_string_with_format(r, 0, format!("{} {}", lvl.code, lvl.label), &f.label)?;
            ws.merge_range(r, 1, r, m.severity.len() as u16, &lvl.description, &f.cell)?;
            ws.set_row_height(r, 30)?;
        }
        r += 2;
    }
    Ok(ws)
}

fn risk_database_sheet(study: &Study) -> Result<Worksheet, XlsxError> {
    let f = Formats::new();
    let mut ws = Worksheet::new();
    ws.set_name("Risk Database")?;
    headers(&mut ws, 0, &[("Category", 26.0), ("Hazardous scenario", 32.0), ("Description", 70.0)], &f)?;
    let mut r = 0u32;
    for c in &study.categories {
        for sc in &c.scenarios {
            r += 1;
            ws.write_string_with_format(r, 0, &c.name, &f.cell)?;
            ws.write_string_with_format(r, 1, &sc.name, &f.cell)?;
            ws.write_string_with_format(r, 2, &sc.description, &f.cell)?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    Ok(ws)
}
