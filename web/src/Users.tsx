import { useEffect, useState } from "react";
import { api, type AuthUser } from "./api";
import { store, toast, useStore } from "./store";

export default function Users() {
  const s = useStore();
  const me = s.auth.user!;
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [nu, setNu] = useState("");
  const [np, setNp] = useState("");
  const [nAdmin, setNAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setUsers(await api.users());
    } catch (e) {
      toast(`Failed to load users: ${e}`);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!nu.trim() || !np) return;
    setBusy(true);
    try {
      await api.createUser(nu.trim(), np, nAdmin);
      setNu("");
      setNp("");
      setNAdmin(false);
      await load();
    } catch (e) {
      toast(`Create failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(u: AuthUser) {
    const pw = prompt(`New password for "${u.username}" (min 8 chars):`);
    if (!pw) return;
    try {
      await api.updateUser(u.id, { password: pw });
      toast("Password updated");
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  }

  async function toggleAdmin(u: AuthUser) {
    try {
      await api.updateUser(u.id, { isAdmin: !u.is_admin });
      await load();
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  }

  async function remove(u: AuthUser) {
    if (!confirm(`Delete user "${u.username}"?`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  }

  return (
    <div className="search-wrap" style={{ maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>Users</h2>
      <p className="muted small">Manage who can access this opencode manager.</p>

      <table className="markdown" style={{ width: "100%", marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Username</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {u.username} {u.id === me.id && <span className="badge">you</span>}
              </td>
              <td style={{ textAlign: "center" }}>
                <span className="badge">{u.is_admin ? "admin" : "user"}</span>
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn sm" onClick={() => changePassword(u)}>
                  Set password
                </button>{" "}
                <button className="btn sm" onClick={() => toggleAdmin(u)}>
                  {u.is_admin ? "Make user" : "Make admin"}
                </button>{" "}
                {u.id !== me.id && (
                  <button className="btn danger sm" onClick={() => remove(u)}>
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={3} className="muted small">
                loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Add user</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="username"
          value={nu}
          onChange={(e) => setNu(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="password (min 8)"
          value={np}
          onChange={(e) => setNp(e.target.value)}
        />
        <label className="small muted">
          <input type="checkbox" checked={nAdmin} onChange={(e) => setNAdmin(e.target.checked)} />{" "}
          admin
        </label>
        <button className="btn primary" disabled={busy || !nu || !np} onClick={add}>
          Add user
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => store.set({ view: "chat" })}>
          ← Back
        </button>
      </div>
    </div>
  );
}
