import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import * as api from "./api";
import { newNode, newStudy } from "./defaults";
import type { Study } from "./types";
import { StudyView } from "./components/StudyView";
import { NodeView } from "./components/NodeView";
import { ActionsView } from "./components/ActionsView";
import { MatrixView } from "./components/MatrixView";
import { GuidewordsView } from "./components/GuidewordsView";

type View = { kind: "study" | "actions" | "matrix" | "guidewords" } | { kind: "node"; id: string };

export default function App() {
  const [study, setStudy] = useState<Study>(newStudy);
  const [path, setPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>({ kind: "study" });
  const [notice, setNotice] = useState("");

  // Keyboard shortcuts and the close handler are registered once, so they read state through refs.
  const state = useRef({ study, path, dirty });
  state.current = { study, path, dirty };

  const update = useCallback((fn: (s: Study) => Study) => {
    setStudy(fn);
    setDirty(true);
  }, []);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2500);
  };

  const fail = (e: unknown) => message(String(e), { title: "HAZID Studio", kind: "error" });

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
    if (await confirmDiscard()) load(newStudy(), null);
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

  const actions = useRef({ newFile, openFile, saveFile, exportFile });
  actions.current = { newFile, openFile, saveFile, exportFile };

  useEffect(() => {
    // Lets the UI run in a plain browser (`npm run dev`) for quick layout work.
    if (!isTauri()) return;
    api.launchFile().then((p) => {
      if (p) actions.current.openFile(p);
    });

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const a = actions.current;
      const k = e.key.toLowerCase();
      if (k === "s") a.saveFile(e.shiftKey);
      else if (k === "o") a.openFile();
      else if (k === "n") a.newFile();
      else if (k === "e") a.exportFile();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);

    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (e) => {
      if (!state.current.dirty) return;
      e.preventDefault();
      if (await confirmDiscard()) await win.destroy();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten.then((f) => f());
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
    const ok = await ask(`Delete "${node?.name}"${count ? ` and its ${count} scenario(s)` : ""}?`, {
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

  const isView = (k: View["kind"], id?: string) => view.kind === k && (!id || (view.kind === "node" && view.id === id));
  const currentNode = view.kind === "node" ? study.nodes.find((n) => n.id === view.id) : undefined;
  const openActions = study.rows.filter((r) => r.recommendations.trim() && r.status !== "Closed").length;

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
          <button className="btn" onClick={() => saveFile()} title="Save (Ctrl/⌘ S) · Save as (Ctrl/⌘ ⇧ S)">Save</button>
          <button className="btn primary" onClick={exportFile} title="Export to Excel (Ctrl/⌘ E)">Export to Excel</button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          <button className={`nav-item ${isView("study") ? "active" : ""}`} onClick={() => setView({ kind: "study" })}>
            Study details
          </button>

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
          <button className={`nav-item ${isView("actions") ? "active" : ""}`} onClick={() => setView({ kind: "actions" })}>
            Action register {openActions > 0 && <span className="count">{openActions}</span>}
          </button>
          <button className={`nav-item ${isView("matrix") ? "active" : ""}`} onClick={() => setView({ kind: "matrix" })}>
            Risk matrix
          </button>
          <button className={`nav-item ${isView("guidewords") ? "active" : ""}`} onClick={() => setView({ kind: "guidewords" })}>
            Guidewords
          </button>
        </nav>

        <main className="content">
          {view.kind === "study" && <StudyView study={study} update={update} />}
          {view.kind === "node" && currentNode && (
            <NodeView key={currentNode.id} study={study} node={currentNode} update={update} />
          )}
          {view.kind === "actions" && <ActionsView study={study} update={update} />}
          {view.kind === "matrix" && <MatrixView study={study} update={update} />}
          {view.kind === "guidewords" && <GuidewordsView study={study} update={update} />}
        </main>
      </div>
    </div>
  );
}
