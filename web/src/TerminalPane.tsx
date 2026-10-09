import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "./api";
import { cssVar } from "./themes";
import { useStore } from "./store";

function termTheme() {
  return {
    background: cssVar("--term-bg") || "#0d1117",
    foreground: cssVar("--term-fg") || "#c9d1d9",
    cursor: cssVar("--term-cursor") || "#c9d1d9",
  };
}

/** Copy text to the clipboard, with a fallback for non-secure contexts. */
export async function copyToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {}
}

const posixQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * An embedded terminal backed by opencode's native PTY API (no Python needed,
 * works on Linux, macOS and Windows).
 *
 * When `sessionId` is given the terminal launches the opencode TUI attached to
 * that session (`opencode attach <server> --session <id>`); otherwise it opens
 * a plain shell.
 */
export default function TerminalPane({
  sessionId,
  directory,
}: {
  sessionId?: string;
  directory?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const theme = useStore().theme;
  const [status, setStatus] = useState("connecting…");

  // Upload dropped/pasted files (images, PDF, anything readable) and type the
  // resulting path(s) into the terminal so opencode can read them.
  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setStatus(`uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    const paths: string[] = [];
    for (const file of files) {
      try {
        const r = await api.upload(directory, file, file.name || "paste");
        paths.push(r.path);
      } catch (err) {
        setStatus(`upload failed: ${err}`);
        return;
      }
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(paths.join(" ") + " ");
    setStatus("");
  }

  // Keep the latest handler available to the native listeners (xterm stops
  // propagation of paste/drop, so React synthetic handlers never fire).
  const uploadRef = useRef(uploadFiles);
  uploadRef.current = uploadFiles;

  function filesFromClipboard(dt: DataTransfer | null): File[] {
    if (!dt) return [];
    const files: File[] = Array.from(dt.files ?? []);
    if (!files.length && dt.items) {
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i]!;
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    return files;
  }

  // Keep the terminal's colours in sync with the active app theme.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = termTheme();
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let ptyId: string | null = null;

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      theme: termTheme(),
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (hostRef.current) term.open(hostRef.current);
    try {
      fit.fit();
    } catch {}

    // Copy on select.
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel && sel.trim()) copyToClipboard(sel);
    });

    const doResize = () => {
      try {
        fit.fit();
      } catch {}
      if (ptyId) {
        api
          .updatePty(ptyId, { size: { rows: term.rows, cols: term.cols } })
          .catch(() => {});
      }
    };
    term.onResize(doResize);

    const ro = new ResizeObserver(() => doResize());
    if (hostRef.current) ro.observe(hostRef.current);

    // Paste / drag-drop files onto the terminal. xterm stops propagation of its
    // textarea's paste event, so use native (capture-phase) listeners here.
    const pane = paneRef.current;
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFromClipboard(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        e.stopPropagation();
        uploadRef.current(files);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) uploadRef.current(files);
    };
    pane?.addEventListener("paste", onPaste, true);
    pane?.addEventListener("dragover", onDragOver, true);
    pane?.addEventListener("drop", onDrop, true);

    (async () => {
      let opencodeUrl = "http://127.0.0.1:4096";
      let opencodeBin = "opencode";
      let platform = /Windows/i.test(navigator.userAgent) ? "win32" : "linux";
      try {
        const cfg = await api.config();
        opencodeUrl = cfg.opencodeUrl || opencodeUrl;
        opencodeBin = cfg.opencodeBin || opencodeBin;
        platform = cfg.platform || platform;
      } catch {}

      const body: {
        command?: string;
        args?: string[];
        cwd?: string;
        title?: string;
      } = { title: sessionId ? `opencode ${sessionId}` : "terminal" };
      if (directory) body.cwd = directory;

      if (sessionId) {
        // Launch the opencode TUI attached to this session. Start it through a
        // shell with the binary's absolute path (spawning it directly as the
        // PTY leader aborts, and bare "opencode" may not be on the PTY's PATH).
        const attach = [opencodeBin, "attach", opencodeUrl, "--session", sessionId];
        if (directory) attach.push("--dir", directory);
        if (platform === "win32") {
          body.command = "powershell.exe";
          body.args = [
            "-NoProfile",
            "-Command",
            "& " + [opencodeBin, "attach", opencodeUrl, "--session", sessionId]
              .concat(directory ? ["--dir", directory] : [])
              .map(psQuote)
              .join(" "),
          ];
        } else {
          body.command = "/bin/bash";
          body.args = ["-lc", "exec " + attach.map(posixQuote).join(" ")];
        }
      }

      let pty: { id: string };
      try {
        pty = await api.createPty(body);
      } catch (e) {
        if (!disposed) setStatus(`could not start terminal: ${e}`);
        return;
      }
      if (disposed) {
        api.deletePty(pty.id).catch(() => {});
        return;
      }
      ptyId = pty.id;

      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ptyws/${pty.id}`);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        if (!disposed) setStatus("");
        doResize();
      };
      ws.onmessage = (ev) => {
        const d: any = ev.data;
        if (typeof d === "string") {
          term.write(d);
        } else {
          const u8 = new Uint8Array(d);
          if (u8.length && u8[0] === 0) return; // control frame (cursor metadata)
          term.write(u8);
        }
      };
      ws.onclose = () => {
        if (!disposed) setStatus("session ended — reopen to reconnect");
      };
      ws.onerror = () => {
        if (!disposed) setStatus("connection error");
      };
      term.onData((data) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
        } catch {}
      });
    })();

    return () => {
      disposed = true;
      ro.disconnect();
      pane?.removeEventListener("paste", onPaste, true);
      pane?.removeEventListener("dragover", onDragOver, true);
      pane?.removeEventListener("drop", onDrop, true);
      wsRef.current = null;
      try {
        ws?.close();
      } catch {}
      if (ptyId) api.deletePty(ptyId).catch(() => {});
      try {
        term.dispose();
      } catch {}
    };
  }, [sessionId, directory]);

  return (
    <div ref={paneRef} className="terminal-pane">
      {status && <div className="terminal-status">{status}</div>}
      <div ref={hostRef} className="terminal-host" />
    </div>
  );
}
