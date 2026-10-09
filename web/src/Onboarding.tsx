import { useState } from "react";
import { api } from "./api";
import { completeOnboarding, setChatMode, setTheme, toast, useStore } from "./store";
import { THEMES } from "./themes";

export default function Onboarding() {
  const s = useStore();
  const [step, setStep] = useState(0);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const mode = s.chatMode;

  const steps = ["Welcome", "Security", "Preferences", "Done"];

  async function savePassword() {
    if (!pw) return;
    if (pw !== pw2) {
      toast("passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(pw);
      toast("password updated");
      setPw("");
      setPw2("");
      setStep(2);
    } catch (e) {
      toast(`Failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 440 }}>
        <div className="brand" style={{ fontSize: 20, marginBottom: 4 }}>
          open<span>code</span> · aiman
        </div>
        <div className="onb-steps">
          {steps.map((label, i) => (
            <span key={label} className={"onb-step" + (i === step ? " active" : i < step ? " done" : "")}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <>
            <h3 style={{ margin: "8px 0" }}>Welcome, {s.auth.user?.username}</h3>
            <p className="muted small">
              aiman is a web UI for your opencode sessions. This short setup covers
              security and your preferred chat experience.
            </p>
            <button className="btn primary full" style={{ marginTop: 16 }} onClick={() => setStep(1)}>
              Get started
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h3 style={{ margin: "8px 0" }}>Security</h3>
            <p className="muted small">
              Your account is protected by a password (minimum 8 characters). Set a
              new one now, or skip if you're happy with the current password.
            </p>
            <label className="small muted" style={{ marginTop: 8 }}>
              New password
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <label className="small muted" style={{ marginTop: 10 }}>
              Confirm password
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn primary" disabled={busy || !pw} onClick={savePassword}>
                Save password
              </button>
              <button className="btn ghost" onClick={() => setStep(2)}>
                Skip
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ margin: "8px 0" }}>Preferences</h3>
            <p className="muted small">How should sessions open?</p>
            <div className="mode-grid" style={{ gridTemplateColumns: "1fr" }}>
              <label className={"mode-card" + (mode === "terminal" ? " active" : "")}>
                <input
                  type="radio"
                  checked={mode === "terminal"}
                  onChange={() => setChatMode("terminal")}
                />
                <div>
                  <div className="mode-title">Terminal chat (default)</div>
                  <div className="small muted">
                    Embedded opencode TUI attached to the session.
                  </div>
                </div>
              </label>
              <label className={"mode-card" + (mode === "web" ? " active" : "")}>
                <input
                  type="radio"
                  checked={mode === "web"}
                  onChange={() => setChatMode("web")}
                />
                <div>
                  <div className="mode-title">Web chat</div>
                  <div className="small muted">Structured messages and composer.</div>
                </div>
              </label>
            </div>
            <p className="muted small" style={{ marginTop: 16 }}>
              Theme
            </p>
            <div className="theme-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
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
                      <div className="tp-body" style={{ background: t.vars["--bg"] }} />
                    </div>
                  </div>
                  <div className="theme-name">{t.name}</div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn ghost" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="btn primary" onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={{ margin: "8px 0" }}>All set</h3>
            <p className="muted small">
              You can change these anytime in Settings. Enjoy aiman.
            </p>
            <button
              className="btn primary full"
              style={{ marginTop: 16 }}
              onClick={() => completeOnboarding()}
            >
              Enter aiman
            </button>
          </>
        )}
      </div>
    </div>
  );
}
