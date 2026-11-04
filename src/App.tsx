import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import * as api from "./api";
import { DEFAULT_MATRIX, copyCategories, defaultCategories, mergeCategories, newNode, newStudy } from "./defaults";
import * as mx from "./matrix";
import type { RiskCategory, RiskMatrix, Row, Study } from "./types";
import { StudyView } from "./components/StudyView";
import { NodeView } from "./components/NodeView";
import { ActionsView } from "./components/ActionsView";
import { MapView } from "./components/MapView";
import { MatrixEditorView, type MatrixScope } from "./components/MatrixEditorView";
import { LandscapeView } from "./components/LandscapeView";
import { RiskDatabaseView, type DatabaseScope } from "./components/RiskDatabaseView";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable: fall back to the system setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type View =
  | { kind: "study" | "landscape" | "actions" | "map" | "database" | "matrix" }
  | { kind: "node"; id: string; rowId?: string };

const countScenarios = (cs: RiskCategory[]) => cs.reduce((n, c) => n + c.scenarios.length, 0);

export default function App() {
  const [database, setDatabaseState] = useState<RiskCategory[]>(defaultCategories);
  const [defaultMatrix, setDefaultMatrixState] = useState<RiskMatrix>(() => structuredClone(DEFAULT_MATRIX));
  const [study, setStudy] = useState<Study>(() => newStudy(database, defaultMatrix));
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>({ kind: "study" });
  const [dbScope, setDbScope] = useState<DatabaseScope>("database");
  const [matrixScope, setMatrixScope] = useState<MatrixScope>("default");
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Not persisted; the choice still applies to this session.
    }
    // Also themes the native title bar (Windows) and window chrome.
    if (isTauri()) getCurrentWindow().setTheme(theme).catch(() => {});
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Menu events and the close handler are registered once, so they read state through refs.
  const state = useRef({ study, path, dirty, database, defaultMatrix });
  state.current = { study, path, dirty, database, defaultMatrix };

  const update = useCallback((fn: (s: Study) => Study) => {
    setStudy(fn);
    setDirty(true);
  }, []);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const fail = (e: unknown) => message(String(e), { title: "HAZID Studio", kind: "error" });

  // The risk database and default matrix are written to disk shortly after each user edit
  // (not after loading them).
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

  const matrixEdited = useRef(false);
  const setDefaultMatrix = (fn: (m: RiskMatrix) => RiskMatrix) => {
    matrixEdited.current = true;
    setDefaultMatrixState(fn);
  };
  useEffect(() => {
    if (!matrixEdited.current || !isTauri()) return;
    const t = window.setTimeout(() => api.saveDefaultMatrix(defaultMatrix).catch(fail), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMatrix]);

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
    if (!(await confirmDiscard())) return;
    try {
      if (isTauri()) await api.resetAttachments();
    } catch (e) {
      return fail(e);
    }
    load(newStudy(state.current.database, state.current.defaultMatrix), null);
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

  const confirm = (text: string, title: string, okLabel: string) =>
    ask(text, { title, kind: "warning", okLabel, cancelLabel: "Cancel" });

  const defaultMatrixToStudy = async () => {
    const { study, defaultMatrix } = state.current;
    const affected = mx.rowsOutOfRange(study.rows, defaultMatrix);
    const text =
      "Replace this study's risk matrix with the default matrix?" +
      (affected ? `\n\n${affected} row(s) have ratings that do not exist in the default matrix; those ratings will be cleared.` : "");
    if (!(await confirm(text, "Apply default matrix", "Apply"))) return;
    update((s) => mx.applyMatrixToStudy(s, defaultMatrix));
    flash("Default matrix applied to this study");
  };

  const studyMatrixToDefault = async () => {
    const ok = await confirm("Replace the default matrix with this study's matrix?", "Save as default", "Replace");
    if (!ok) return;
    setDefaultMatrix(() => structuredClone(state.current.study.matrix));
    flash("Saved as the default matrix");
  };

  const removeMatrixLevel = async (axis: mx.Axis, index: number) => {
    const name = axis === "likelihood" ? "likelihood" : "severity";
    if (matrixScope === "default") return setDefaultMatrix((m) => mx.removeLevel(m, axis, index));
    const used = mx.rowsUsingLevel(study.rows, axis, index);
    if (used > 0) {
      const lvl = study.matrix[axis][index];
      const ok = await confirm(
        `${used} row(s) are rated with ${name} level ${lvl.code} (${lvl.label}). Their ${name} rating will be cleared so you can review them.`,
        "Remove level",
        "Remove and clear",
      );
      if (!ok) return;
    }
    update((s) => mx.removeLevelFromStudy(s, axis, index));
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
      case "view-map": return setView({ kind: "map" });
      case "toggle-theme": return toggleTheme();
      case "mx-default":
        setMatrixScope("default");
        return setView({ kind: "matrix" });
      case "mx-study":
        setMatrixScope("study");
        return setView({ kind: "matrix" });
      case "mx-to-study": return defaultMatrixToStudy();
      case "study-to-mx": return studyMatrixToDefault();
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

    Promise.all([api.loadRiskDatabase(), api.loadDefaultMatrix()])
      .then(([db, matrix]) => {
        if (db) setDatabaseState(db);
        if (matrix) setDefaultMatrixState(matrix);
        // The untouched startup study was created from the built-in defaults; give it the user's.
        if (!state.current.dirty && !state.current.path) {
          setStudy((s) => ({
            ...s,
            categories: db ? copyCategories(db) : s.categories,
            matrix: matrix ? structuredClone(matrix) : s.matrix,
          }));
        }
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
    const files = study.attachments.filter((a) => a.nodeId === id).length;
    const parts = [count && `${count} row(s)`, files && `${files} attachment(s)`].filter(Boolean).join(" and ");
    const ok = await ask(`Delete "${node?.name}"${parts ? ` and its ${parts}` : ""}?`, {
      title: "Delete node",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    update((s) => ({
      ...s,
      nodes: s.nodes.filter((n) => n.id !== id),
      rows: s.rows.filter((r) => r.nodeId !== id),
      attachments: s.attachments.filter((a) => a.nodeId !== id),
    }));
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
          <button
            className="btn theme-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode (Ctrl/⌘ ⇧ D)" : "Switch to dark mode (Ctrl/⌘ ⇧ D)"}
            aria-label="Toggle dark mode"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
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
          {navButton("map", "Risk map")}

          <div className="nav-section"><span>Criteria</span></div>
          {navButton("database", "Risk database")}
          {navButton("matrix", "Risk matrix")}
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
          {view.kind === "map" && (
            <MapView
              study={study}
              onEditMatrix={() => {
                setMatrixScope("study");
                setView({ kind: "matrix" });
              }}
            />
          )}
          {view.kind === "matrix" && (
            <MatrixEditorView
              scope={matrixScope}
              onScope={setMatrixScope}
              matrix={matrixScope === "default" ? defaultMatrix : study.matrix}
              onChange={
                matrixScope === "default"
                  ? setDefaultMatrix
                  : (fn) => update((s) => ({ ...s, matrix: fn(s.matrix) }))
              }
              onRemoveLevel={removeMatrixLevel}
              onDefaultToStudy={defaultMatrixToStudy}
              onStudyToDefault={studyMatrixToDefault}
            />
          )}
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
