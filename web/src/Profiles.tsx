import { useEffect, useState } from "react";
import { api, type Profile } from "./api";
import { activateProfile, loadProfiles, store, toast, useStore } from "./store";

export default function Profiles() {
  const s = useStore();
  const me = s.auth.user!;
  const [newName, setNewName] = useState("");
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [providerID, setProviderID] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    loadProfiles();
  }, []);

  async function create() {
    if (!newName.trim()) return;
    try {
      await api.createProfile(newName.trim());
      setNewName("");
      await loadProfiles();
    } catch (e) {
      toast(String(e));
    }
  }

  async function addKey(p: Profile) {
    if (!providerID.trim() || !key.trim()) return;
    try {
      await api.setProfileAuth(p.id, [{ providerID: providerID.trim(), key: key.trim() }]);
      setProviderID("");
      setKey("");
      setAddingFor(null);
      await loadProfiles();
      toast("key saved");
    } catch (e) {
      toast(String(e));
    }
  }

  async function removeKey(p: Profile, providerID: string) {
    if (!confirm(`Remove ${providerID} from "${p.name}"?`)) return;
    await api.removeProfileAuth(p.id, providerID).catch((e) => toast(String(e)));
    await loadProfiles();
  }

  async function del(p: Profile) {
    if (!confirm(`Delete profile "${p.name}"?`)) return;
    await api.deleteProfile(p.id).catch((e) => toast(String(e)));
    await loadProfiles();
  }

  async function rename(p: Profile) {
    const n = prompt("Profile name:", p.name);
    if (!n) return;
    await api.renameProfile(p.id, n).catch((e) => toast(String(e)));
    await loadProfiles();
  }

  return (
    <div className="search-wrap" style={{ maxWidth: 820 }}>
      <h2 style={{ marginTop: 0 }}>Config profiles</h2>
      <p className="muted small">
        Each profile holds provider API keys (DeepSeek, OpenAI, …). Activating a profile
        switches the credentials the opencode server uses. Switching is server-wide; the
        previous <code>auth.json</code> is backed up first.
      </p>

      {s.profiles.map((p) => {
        const isActive = s.activeProfile === p.id;
        return (
          <div className="profile-card" key={p.id}>
            <div className="profile-head">
              <b>{p.name}</b>
              {isActive && <span className="badge completed">active</span>}
              <div className="spacer" />
              <button className="btn primary sm" disabled={isActive} onClick={() => activateProfile(p.id)}>
                {isActive ? "Active" : "Activate"}
              </button>
              <button className="btn ghost sm" onClick={() => rename(p)}>
                rename
              </button>
              {me.is_admin && (
                <button className="btn danger sm" onClick={() => del(p)}>
                  delete
                </button>
              )}
            </div>
            <div className="profile-providers">
              {p.providers.length === 0 && <span className="muted small">no providers yet</span>}
              {p.providers.map((pr) => (
                <span className="badge" key={pr.providerID}>
                  {pr.providerID} · {pr.hint}{" "}
                  {me.is_admin && (
                    <a style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeKey(p, pr.providerID)}>
                      ×
                    </a>
                  )}
                </span>
              ))}
            </div>
            {me.is_admin && (
              <div style={{ marginTop: 8 }}>
                {addingFor === p.id ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      className="input"
                      placeholder="provider id (e.g. deepseek, openai)"
                      value={providerID}
                      onChange={(e) => setProviderID(e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="API key"
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                    <button className="btn sm primary" onClick={() => addKey(p)}>
                      Save
                    </button>
                    <button className="btn sm ghost" onClick={() => setAddingFor(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button className="btn sm" onClick={() => setAddingFor(p.id)}>
                    + Add provider key
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {me.is_admin && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input
            className="input"
            placeholder="New profile name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn primary" onClick={create}>
            Create profile
          </button>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => store.set({ view: "chat" })}>
          ← Back
        </button>
      </div>
    </div>
  );
}
