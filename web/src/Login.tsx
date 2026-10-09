import { useState } from "react";
import { login, setupAdmin, useStore } from "./store";

export default function Login() {
  const s = useStore();
  const needsSetup = s.auth.needsSetup;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== confirm) {
      setError("passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (needsSetup) await setupAdmin(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err: any) {
      setError(String(err.message ?? err));
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: 20, marginBottom: 4 }}>
          open<span>code</span> · sessions
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {needsSetup
            ? "Create the administrator account to get started."
            : "Sign in to continue."}
        </p>

        <label className="small muted">Username</label>
        <input
          className="input"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="small muted" style={{ marginTop: 10 }}>
          Password
        </label>
        <input
          className="input"
          type="password"
          autoComplete={needsSetup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {needsSetup && (
          <>
            <label className="small muted" style={{ marginTop: 10 }}>
              Confirm password
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </>
        )}

        {error && (
          <div className="small" style={{ color: "var(--red)", marginTop: 10 }}>
            {error}
          </div>
        )}

        <button
          className="btn primary full"
          style={{ marginTop: 16 }}
          disabled={busy || !username || !password}
          type="submit"
        >
          {busy ? "Please wait…" : needsSetup ? "Create admin account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
