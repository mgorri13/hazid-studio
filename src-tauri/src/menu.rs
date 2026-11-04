//! Native menu bar. Each custom item's id is sent to the frontend as a `menu` event.

use tauri::menu::{Menu, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Wry};

fn item(app: &AppHandle, id: &str, text: &str, accel: Option<&str>) -> tauri::Result<tauri::menu::MenuItem<Wry>> {
    let mut b = MenuItemBuilder::with_id(id, text);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    b.build(app)
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "new", "New Study", Some("CmdOrCtrl+N"))?)
        .item(&item(app, "open", "Open…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item(app, "save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item(app, "export", "Export to Excel…", Some("CmdOrCtrl+E"))?);
    // macOS has Quit in the application menu instead.
    #[cfg(not(target_os = "macos"))]
    let file = file.separator().item(&item(app, "quit", "Exit", None)?);
    let file = file.build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "view-study", "Study Details", Some("CmdOrCtrl+1"))?)
        .item(&item(app, "view-landscape", "Risk Landscape", Some("CmdOrCtrl+2"))?)
        .item(&item(app, "view-actions", "Action Register", Some("CmdOrCtrl+3"))?)
        .item(&item(app, "view-matrix", "Risk Matrix", Some("CmdOrCtrl+4"))?)
        .build()?;

    let database = SubmenuBuilder::new(app, "Risk Database")
        .item(&item(app, "db-open", "Open Risk Database", Some("CmdOrCtrl+D"))?)
        .item(&item(app, "db-study", "Edit This Study's Risks", None)?)
        .separator()
        .item(&item(app, "db-to-study", "Add Database Risks to This Study", None)?)
        .item(&item(app, "study-to-db", "Save This Study's Risks to Database", None)?)
        .build()?;

    let mut menus: Vec<Submenu<Wry>> = Vec::new();
    #[cfg(target_os = "macos")]
    menus.push(
        SubmenuBuilder::new(app, "HAZID Studio")
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            // Custom quit so unsaved changes can be confirmed first.
            .item(&item(app, "quit", "Quit HAZID Studio", Some("CmdOrCtrl+Q"))?)
            .build()?,
    );
    menus.extend([file, edit, view, database]);

    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = menus.iter().map(|m| m as _).collect();
    Menu::with_items(app, &refs)
}
