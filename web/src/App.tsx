import { useEffect } from "react";
import {
  activateProfile,
  applyLocation,
  bootstrapAuth,
  logout,
  pathFor,
  store,
  useStore,
} from "./store";
import Sidebar from "./Sidebar";
import SessionList from "./SessionList";
import ChatView from "./ChatView";
import SearchView from "./SearchView";
import TerminalView from "./TerminalView";
import Users from "./Users";
import StatsView from "./StatsView";
import Profiles from "./Profiles";
import SettingsView from "./SettingsView";
import Overlays from "./Overlays";
import Login from "./Login";
import Onboarding from "./Onboarding";

export default function App() {
  const s = useStore();

  useEffect(() => {
    bootstrapAuth().catch((e) => console.error(e));
  }, []);

  // Keep the browser URL in sync with the active view / session (handles).
  useEffect(() => {
    const onPop = () => {
      if (store.get().routeReady) applyLocation().catch(() => {});
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof location === "undefined" || !s.routeReady) return;
    const desired = pathFor(s.view, s.activeSessionId);
    if (location.pathname + location.search !== desired) {
      history.pushState(null, "", desired);
    }
  }, [s.view, s.activeSessionId, s.routeReady]);

  if (s.auth.loading) {
    return (
      <div className="empty" style={{ height: "100vh" }}>
        loading…
      </div>
    );
  }

  if (!s.auth.authenticated) return <Login />;
  if (s.onboarded === false) return <Onboarding />;

  const isAdmin = !!s.auth.user?.is_admin;
  const setView = (view: any) => store.set({ view });

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          open<span>code</span> · sessions
        </div>
        <div className="tabs">
          {(["chat", "search", "stats", "terminal", "settings"] as const).map((v) => (
            <button
              key={v}
              className={"tab" + (s.view === v ? " active" : "")}
              onClick={() => setView(v)}
            >
              {v === "chat"
                ? "Sessions"
                : v === "search"
                  ? "Search"
                  : v === "stats"
                    ? "Stats"
                    : v === "terminal"
                      ? "Terminal"
                      : "Settings"}
            </button>
          ))}
          {isAdmin && (
            <button
              className={"tab" + (s.view === "users" ? " active" : "")}
              onClick={() => setView("users")}
            >
              Users
            </button>
          )}
          <button
            className={"tab" + (s.view === "profiles" ? " active" : "")}
            onClick={() => setView("profiles")}
          >
            Profiles
          </button>
        </div>
        <div className="spacer" />
        {s.profiles.length > 0 && (
          <select
            className="input"
            title="Switch config profile"
            value={s.activeProfile ?? ""}
            onChange={(e) => activateProfile(e.target.value)}
          >
            {!s.activeProfile && <option value="">profile…</option>}
            {s.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className="small muted">
          <span className={"dot " + (s.connected ? "up" : "down")} />{" "}
          {s.connected ? "live" : "disconnected"}
        </span>
        <span className="small muted" style={{ marginLeft: 10 }}>
          {s.auth.user?.username}
        </span>
        <button className="btn ghost sm" onClick={() => logout()}>
          Log out
        </button>
      </div>

      <div className="layout">
        <Sidebar />
        <div className="main">
          {s.view === "chat" && (s.activeSessionId ? <ChatView /> : <SessionList />)}
          {s.view === "search" && <SearchView />}
          {s.view === "stats" && <StatsView />}
          {s.view === "terminal" && <TerminalView />}
          {s.view === "users" && isAdmin && <Users />}
          {s.view === "profiles" && <Profiles />}
          {s.view === "settings" && <SettingsView />}
        </div>
      </div>

      {s.toast && <div className="toast">{s.toast}</div>}
      <Overlays />
    </div>
  );
}
