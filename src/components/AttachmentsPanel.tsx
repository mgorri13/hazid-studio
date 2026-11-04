import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, message, save } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import type { Attachment, Node, Study } from "../types";

// Image previews are loaded once per attachment and kept for the session.
const previews = new Map<string, string>();

const isImage = (a: Attachment) => a.mime.startsWith("image/") && !a.mime.includes("dwg") && !a.mime.includes("dxf");

const extension = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "FILE";
};

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

const fail = (e: unknown) => message(String(e), { title: "HAZID Studio", kind: "error" });

interface Props {
  study: Study;
  node: Node;
  update: (fn: (s: Study) => Study) => void;
}

export function AttachmentsPanel({ study, node, update }: Props) {
  const files = study.attachments.filter((a) => a.nodeId === node.id);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const attach = async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const added = await api.addAttachments(node.id, paths);
      update((s) => ({ ...s, attachments: [...s.attachments, ...added] }));
    } catch (e) {
      fail(e);
    }
  };

  // Files dropped anywhere on the window are attached to the node being shown.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over" || e.payload.type === "enter") setDragging(true);
      else if (e.payload.type === "leave") setDragging(false);
      else if (e.payload.type === "drop") {
        setDragging(false);
        attach(e.payload.paths);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const remove = async (a: Attachment) => {
    const ok = await ask(`Remove "${a.name}" from this node?`, {
      title: "Remove attachment",
      kind: "warning",
      okLabel: "Remove",
      cancelLabel: "Cancel",
    });
    if (ok) update((s) => ({ ...s, attachments: s.attachments.filter((x) => x.id !== a.id) }));
  };

  const saveCopy = async (a: Attachment) => {
    const path = await save({ defaultPath: a.name });
    if (path) api.exportAttachment(a, path).catch(fail);
  };

  const openFile = (a: Attachment) => (isImage(a) ? setViewing(a) : api.openAttachment(a).catch(fail));

  return (
    <section className="attach-panel">
      <div className="attach-head">
        <span className="attach-title">
          Documents and drawings <span className="muted">{files.length > 0 && files.length}</span>
        </span>
        <button className="btn" onClick={async () => attach(await api.pickAttachmentPaths())}>
          Attach files
        </button>
      </div>

      {files.length === 0 ? (
        <p className="muted attach-empty">
          Attach P&IDs, drawings, data sheets or any other document — or drop files onto this window.
        </p>
      ) : (
        <div className="attach-grid">
          {files.map((a) => (
            <div key={a.id} className="attach-card">
              <button className="attach-thumb" onClick={() => openFile(a)} title={isImage(a) ? "View" : "Open"}>
                {isImage(a) ? <Preview attachment={a} /> : <span className="attach-ext">{extension(a.name)}</span>}
              </button>
              <div className="attach-meta">
                <span className="attach-name" title={a.name}>{a.name}</span>
                <span className="muted">{formatSize(a.size)}</span>
              </div>
              <div className="attach-tools">
                <button className="icon-btn" title="Open with default app" onClick={() => api.openAttachment(a).catch(fail)}>↗</button>
                <button className="icon-btn" title="Save a copy…" onClick={() => saveCopy(a)}>↓</button>
                <button className="icon-btn danger" title="Remove" onClick={() => remove(a)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dragging && (
        <div className="drop-overlay">
          <div>Drop to attach to “{node.name || "this node"}”</div>
        </div>
      )}

      {viewing && (
        <div className="lightbox" onClick={() => setViewing(null)}>
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span>{viewing.name}</span>
            <span className="lightbox-tools">
              <button className="btn" onClick={() => api.openAttachment(viewing).catch(fail)}>Open with default app</button>
              <button className="btn" onClick={() => setViewing(null)}>Close</button>
            </span>
          </div>
          <Preview attachment={viewing} large />
        </div>
      )}
    </section>
  );
}

function Preview({ attachment, large }: { attachment: Attachment; large?: boolean }) {
  const [src, setSrc] = useState(previews.get(attachment.id));
  useEffect(() => {
    if (src || !isTauri()) return;
    api
      .attachmentDataUrl(attachment)
      .then((url) => {
        previews.set(attachment.id, url);
        setSrc(url);
      })
      .catch(() => {});
  }, [attachment, src]);
  if (!src) return <span className="attach-ext">{extension(attachment.name)}</span>;
  return <img src={src} alt={attachment.name} className={large ? "lightbox-img" : ""} onClick={large ? (e) => e.stopPropagation() : undefined} />;
}
