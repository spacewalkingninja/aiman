import { useEffect, useState } from "react";
import { api } from "./api";
import { setChatMode, store, useStore } from "./store";

export default function SettingsView() {
  const s = useStore();
  const [cfg, setCfg] = useState<{ opencodeUrl: string; terminal: boolean } | null>(null);

  useEffect(() => {
    api
      .config()
      .then(setCfg)
      .catch(() => {});
  }, []);

  const mode = s.chatMode;

  return (
    <div className="search-wrap" style={{ maxWidth: 780 }}>
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      <h3>Chat mode</h3>
      <p className="muted small">
        How sessions open. <b>Terminal chat</b> embeds the opencode TUI using
        opencode's native PTY — it works on Linux, macOS and Windows and needs no
        extra backend. <b>Web chat</b> is the classic structured message view.
      </p>

      <div className="mode-grid">
        <label className={"mode-card" + (mode === "terminal" ? " active" : "")}>
          <input
            type="radio"
            name="chatmode"
            checked={mode === "terminal"}
            onChange={() => setChatMode("terminal")}
          />
          <div>
            <div className="mode-title">
              Terminal chat <span className="badge completed">default</span>
            </div>
            <div className="small muted">
              Full opencode TUI attached to the session (streaming, tools and
              slash commands in one view). Opening a session launches{" "}
              <code>opencode attach … --session &lt;id&gt;</code>.
            </div>
          </div>
        </label>

        <label className={"mode-card" + (mode === "web" ? " active" : "")}>
          <input
            type="radio"
            name="chatmode"
            checked={mode === "web"}
            onChange={() => setChatMode("web")}
          />
          <div>
            <div className="mode-title">Web chat</div>
            <div className="small muted">
              Structured messages with permission prompts, todos and the composer.
            </div>
          </div>
        </label>
      </div>

      <h3 style={{ marginTop: 24 }}>Backend</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>opencode server</td>
            <td>
              <code>{cfg?.opencodeUrl ?? "…"}</code>
            </td>
          </tr>
          <tr>
            <td>native PTY</td>
            <td>
              {cfg ? (
                cfg.terminal ? (
                  <span className="badge completed">available</span>
                ) : (
                  <span className="badge">unavailable</span>
                )
              ) : (
                "…"
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => store.set({ view: "chat" })}>
          ← Back
        </button>
      </div>
    </div>
  );
}
