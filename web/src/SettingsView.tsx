import { useEffect, useState } from "react";
import { api } from "./api";
import { setChatMode, setTheme, store, useStore } from "./store";
import { THEMES } from "./themes";

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

      <h3>Appearance</h3>
      <p className="muted small">
        Pick a theme — it applies to the whole app (sessions, chat, terminal and
        the code map). Windows XP and 98 use the authentic xp.css / 98.css skins.
      </p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={"theme-card" + (s.theme === t.id ? " active" : "")}
            onClick={() => setTheme(t.id)}
          >
            <div className="theme-preview" style={{ background: t.vars["--bg"] }}>
              <div className="tp-side" style={{ background: t.vars["--bg-2"] }} />
              <div className="tp-main">
                <div className="tp-bar" style={{ background: t.vars["--accent"] }} />
                <div className="tp-body" style={{ background: t.vars["--bg"] }}>
                  <span className="tp-dot" style={{ background: t.vars["--accent"] }} />
                  <span className="tp-dot" style={{ background: t.vars["--green"] }} />
                  <span className="tp-dot" style={{ background: t.vars["--red"] }} />
                </div>
              </div>
            </div>
            <div className="theme-name">
              {t.name}
              {s.theme === t.id && <span className="badge completed">active</span>}
            </div>
            <div className="theme-desc">{t.description}</div>
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Chat mode</h3>
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
