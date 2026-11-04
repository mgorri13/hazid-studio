import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import * as api from "./api";
import { copyCategories, defaultCategories, mergeCategories, newNode, newStudy } from "./defaults";
import type { RiskCategory, Row, Study } from "./types";
import { StudyView } from "./components/StudyView";
import { NodeView } from "./components/NodeView";
import { ActionsView } from "./components/ActionsView";
import { MatrixView } from "./components/MatrixView";
import { LandscapeView } from "./components/LandscapeView";
import { RiskDatabaseView, type DatabaseScope } from "./components/RiskDatabaseView";

type View =
  | { kind: "study" | "landscape" | "actions" | "matrix" | "database" }
  | { kind: "node"; id: string; rowId?: string };

const countScenarios = (cs: RiskCategory[]) => cs.reduce((n, c) => n + c.scenarios.length, 0);

export default function App() {
  const [database, setDatabaseState] = useState<RiskCategory[]>(defaultCategories);
  const [study, setStudy] = useState<Study>(() => newStudy(database));
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>({ kind: "study" });
  const [dbScope, setDbScope] = useState<DatabaseScope>("database");
  const [notice, setNotice] = useState("");

  // Menu events and the close handler are registered once, so they read state through refs.
  const state = useRef({ study, path, dirty, database });
  state.current = { study, path, dirty, database };

  const update = useCallback((fn: (s: Study) => Study) => {
    setStudy(fn);
    setDirty(true);
  }, []);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const fail = (e: unknown) => message(String(e), { title: "HAZID Studio", kind: "error" });

  // The risk database is written to disk shortly after each user edit (not after loading it).
  const dbEdited = useRef(false);
  const setDatabase = (fn: (c: RiskCategory[]) => RiskCategory[]) => {
    dbEdited.current = true;
    setDatabaseState(fn);
  };
  useEffect(() => {
    if (!dbEdited.current || !isTauri()) return;
    const t = window.setTimeout(() => api.saveRiskDatabase(database).catch(fail), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database]);

  const confirmDiscard = async () =>
    !state.current.dirty ||
    (await ask("You have unsaved changes. Discard them?", {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    }));

  const load = (s: Study, p: string | null) => {
    setStudy(s);
    setPath(p);
    setDirty(false);
    setView({ kind: "study" });
  };

  const newFile = async () => {
    if (await confirmDiscard()) load(newStudy(state.current.database), null);
  };

  const openFile = async (given?: string) => {
    if (!given && !(await confirmDiscard())) return;
    const p = given ?? (await api.pickOpenPath());
    if (!p) return;
    try {
      load(await api.loadStudy(p), p);
    } catch (e) {
      fail(e);
    }
  };

  const saveFile = async (saveAs = false) => {
    const { study, path } = state.current;
    let p = path;
    if (!p || saveAs) p = await api.pickSavePath(`${api.slug(study.info.title)}.hazid`);
    if (!p) return;
    try {
      await api.saveStudy(p, study);
      setPath(p);
      // Only clear the flag if nothing was edited while saving.
      if (state.current.study === study) setDirty(false);
      flash("Saved");
    } catch (e) {
      fail(e);
    }
  };

  const exportFile = async () => {
    const { study } = state.current;
    const p = await api.pickExcelPath(`${api.slug(study.info.title)}.xlsx`);
    if (!p) return;
    try {
      await api.exportExcel(p, study);
      flash(`Exported ${api.fileName(p)}`);
    } catch (e) {
      fail(e);
    }
  };

  const databaseToStudy = () => {
    const { study, database } = state.current;
    const merged = mergeCategories(study.categories, database);
    const added = countScenarios(merged) - countScenarios(study.categories);
    if (added > 0) update((s) => ({ ...s, categories: mergeCategories(s.categories, database) }));
    flash(added > 0 ? `Added ${added} hazardous scenario(s) to this study` : "This study already has every scenario in the database");
  };

  const studyToDatabase = () => {
    const { study, database } = state.current;
    const added = countScenarios(mergeCategories(database, study.categories)) - countScenarios(database);
    if (added > 0) setDatabase((db) => mergeCategories(db, study.categories));
    flash(added > 0 ? `Saved ${added} hazardous scenario(s) to the database` : "The database already has every scenario in this study");
  };

  const quit = async () => {
    if (await confirmDiscard()) await getCurrentWindow().destroy();
  };

  const onMenu = (id: string) => {
    switch (id) {
      case "new": return newFile();
      case "open": return openFile();
      case "save": return saveFile();
      case "save-as": return saveFile(true);
      case "export": return exportFile();
      case "quit": return quit();
      case "view-study": return setView({ kind: "study" });
      case "view-landscape": return setView({ kind: "landscape" });
      case "view-actions": return setView({ kind: "actions" });
      case "view-matrix": return setView({ kind: "matrix" });
      case "db-open":
        setDbScope("database");
        return setView({ kind: "database" });
      case "db-study":
        setDbScope("study");
        return setView({ kind: "database" });
      case "db-to-study": return databaseToStudy();
      case "study-to-db": return studyToDatabase();
    }
  };
  const menuHandler = useRef(onMenu);
  menuHandler.current = onMenu;

  useEffect(() => {
    // Lets the UI run in a plain browser (`npm run dev`) for quick layout work.
    if (!isTauri()) return;

    api
      .loadRiskDatabase()
      .then((db) => {
        if (!db) return;
        setDatabaseState(db);
        // The untouched startup study was created from the defaults; give it the user's database.
        if (!state.current.dirty && !state.current.path) setStudy((s) => ({ ...s, categories: copyCategories(db) }));
      })
      .catch(fail)
      .finally(() =>
        api.launchFile().then((p) => {
          if (p) openFile(p);
        }),
      );

    const unlistenMenu = listen<string>("menu", (e) => menuHandler.current(e.payload));
    const win = getCurrentWindow();
    const unlistenClose = win.onCloseRequested(async (e) => {
      if (!state.current.dirty) return;
      e.preventDefault();
      if (await confirmDiscard()) await win.destroy();
    });
    return () => {
      unlistenMenu.then((f) => f());
      unlistenClose.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const docName = path ? api.fileName(path) : "Untitled";
  useEffect(() => {
    if (isTauri()) getCurrentWindow().setTitle(`${dirty ? "• " : ""}${docName} — HAZID Studio`);
  }, [docName, dirty]);

  const addNode = () => {
    const node = newNode(study.nodes.length + 1);
    update((s) => ({ ...s, nodes: [...s.nodes, node] }));
    setView({ kind: "node", id: node.id });
  };

  const deleteNode = async (id: string) => {
    const node = study.nodes.find((n) => n.id === id);
    const count = study.rows.filter((r) => r.nodeId === id).length;
    const ok = await ask(`Delete "${node?.name}"${count ? ` and its ${count} row(s)` : ""}?`, {
      title: "Delete node",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    update((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== id), rows: s.rows.filter((r) => r.nodeId !== id) }));
    setView({ kind: "study" });
  };

  const moveNode = (id: string, dir: -1 | 1) =>
    update((s) => {
      const i = s.nodes.findIndex((n) => n.id === id);
      const j = i + dir;
      if (j < 0 || j >= s.nodes.length) return s;
      const nodes = [...s.nodes];
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
      return { ...s, nodes };
    });

  const openRow = (row: Row) => setView({ kind: "node", id: row.nodeId, rowId: row.id });

  const isView = (k: View["kind"], id?: string) => view.kind === k && (!id || (view.kind === "node" && view.id === id));
  const currentNode = view.kind === "node" ? study.nodes.find((n) => n.id === view.id) : undefined;
  const openActions = study.rows.filter((r) => r.recommendations.trim() && r.status !== "Closed").length;

  const navButton = (kind: Exclude<View["kind"], "node">, label: string, extra?: React.ReactNode) => (
    <button className={`nav-item ${isView(kind) ? "active" : ""}`} onClick={() => setView({ kind })}>
      {label} {extra}
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="doc">
          <span className="doc-name">{study.info.title || "Untitled study"}</span>
          <span className="muted">
            {docName}
            {dirty && <span className="dirty" title="Unsaved changes"> ●</span>}
          </span>
        </div>
        <div className="toolbar">
          {notice && <span className="notice">{notice}</span>}
          <button className="btn" onClick={newFile} title="New study (Ctrl/⌘ N)">New</button>
          <button className="btn" onClick={() => openFile()} title="Open study (Ctrl/⌘ O)">Open</button>
          <button className="btn" onClick={() => saveFile()} title="Save (Ctrl/⌘ S)">Save</button>
          <button className="btn primary" onClick={exportFile} title="Export to Excel (Ctrl/⌘ E)">Export to Excel</button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          {navButton("study", "Study details")}

          <div className="nav-section">
            <span>Nodes</span>
            <button className="icon-btn" title="Add node" onClick={addNode}>+</button>
          </div>
          {study.nodes.length === 0 && <p className="nav-empty">No nodes yet</p>}
          {study.nodes.map((n, i) => {
            const count = study.rows.filter((r) => r.nodeId === n.id).length;
            return (
              <div key={n.id} className={`nav-item node-item ${isView("node", n.id) ? "active" : ""}`}>
                <button className="node-link" onClick={() => setView({ kind: "node", id: n.id })}>
                  <span className="node-num">{i + 1}</span>
                  <span className="node-name">{n.name || "Unnamed"}</span>
                  {count > 0 && <span className="count">{count}</span>}
                </button>
                <span className="node-tools">
                  <button className="icon-btn" title="Move up" onClick={() => moveNode(n.id, -1)}>↑</button>
                  <button className="icon-btn" title="Move down" onClick={() => moveNode(n.id, 1)}>↓</button>
                  <button className="icon-btn danger" title="Delete node" onClick={() => deleteNode(n.id)}>×</button>
                </span>
              </div>
            );
          })}

          <div className="nav-section"><span>Review</span></div>
          {navButton("landscape", "Risk landscape")}
          {navButton("actions", "Action register", openActions > 0 && <span className="count">{openActions}</span>)}
          {navButton("matrix", "Risk matrix")}
          {navButton("database", "Risk database")}
        </nav>

        <main className="content">
          {view.kind === "study" && <StudyView study={study} update={update} />}
          {view.kind === "node" && currentNode && (
            <NodeView
              key={`${currentNode.id}-${view.rowId ?? ""}`}
              study={study}
              node={currentNode}
              update={update}
              highlightId={view.rowId}
            />
          )}
          {view.kind === "landscape" && <LandscapeView study={study} onOpenRow={openRow} />}
          {view.kind === "actions" && <ActionsView study={study} update={update} />}
          {view.kind === "matrix" && <MatrixView study={study} update={update} />}
          {view.kind === "database" && (
            <RiskDatabaseView
              scope={dbScope}
              onScope={setDbScope}
              categories={dbScope === "database" ? database : study.categories}
              onChange={
                dbScope === "database" ? setDatabase : (fn) => update((s) => ({ ...s, categories: fn(s.categories) }))
              }
              onDatabaseToStudy={databaseToStudy}
              onStudyToDatabase={studyToDatabase}
            />
          )}
        </main>
      </div>
    </div>
  );
}
