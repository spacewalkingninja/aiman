import { useEffect, useMemo, useState } from "react";
import { api, type TreeNode } from "./api";
import { toast } from "./store";

function flatten(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    else if (n.children) flatten(n.children, out);
  }
  return out;
}

/**
 * Quick file editor for a session's working directory: list, open/edit, upload
 * and delete files.
 */
export default function FileBrowser({
  directory,
  onClose,
}: {
  directory: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<TreeNode[]>([]);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!directory) return;
    try {
      const t = await api.tree(directory, { depth: 12, max: 8000 });
      setFiles(flatten(t.children ?? []));
    } catch (e) {
      toast(`Failed to list files: ${e}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory]);

  const shown = useMemo(() => {
    const s = q.toLowerCase();
    return files
      .filter((f) => !s || f.path.toLowerCase().includes(s))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 2000);
  }, [files, q]);

  async function open(f: TreeNode) {
    setCur(f.path);
    setDirty(false);
    try {
      const d = await api.fileGet(directory, f.path);
      if (d.type === "text") setContent(d.content ?? "");
      else {
        setContent("");
        toast("binary file — not editable");
      }
    } catch (e) {
      toast(String(e));
    }
  }

  async function save() {
    if (!cur) return;
    setBusy(true);
    try {
      await api.filePut(directory, cur, content);
      setDirty(false);
      toast("saved");
    } catch (e) {
      toast(`Save failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function del(f: TreeNode) {
    if (!confirm(`Delete ${f.path}?`)) return;
    try {
      await api.deleteFile(directory, f.path);
      toast("deleted");
      if (cur === f.path) {
        setCur(null);
        setContent("");
      }
      await load();
    } catch (e) {
      toast(`Delete failed: ${e}`);
    }
  }

  async function upload(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) await api.upload(directory, file, file.name);
      toast("uploaded");
      await load();
    } catch (e) {
      toast(`Upload failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box file-browser" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title fb-head">
          <span>Files</span>
          <span className="muted small">{directory}</span>
          <div className="spacer" />
          <label className="btn ghost sm" style={{ cursor: "pointer" }}>
            upload
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
          <button className="btn ghost sm" onClick={load} title="Reload">
            ⟳
          </button>
          <button className="btn sm" onClick={onClose}>
            close
          </button>
        </div>
        <div className="fb-split">
          <div className="fb-list">
            <input
              className="input"
              placeholder="filter files…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: "100%", marginBottom: 6 }}
            />
            {shown.map((f) => (
              <div
                key={f.path}
                className={"fb-item" + (cur === f.path ? " active" : "")}
                onClick={() => open(f)}
              >
                <span className="fb-path">{f.path}</span>
                <button
                  className="btn ghost sm"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    del(f);
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
            {shown.length === 0 && <div className="muted small">no files</div>}
          </div>
          <div className="fb-editor">
            {cur ? (
              <>
                <div className="fb-edit-head">
                  <span className="cm-path" title={cur}>
                    {cur}
                  </span>
                  <div className="spacer" />
                  <button className="btn sm primary" disabled={busy || !dirty} onClick={save}>
                    Save
                  </button>
                </div>
                <textarea
                  className="cm-editor"
                  spellCheck={false}
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                />
              </>
            ) : (
              <div className="empty">select a file to edit</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
