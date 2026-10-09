import { useEffect, useState } from "react";
import { api } from "./api";
import {
  closeMenu,
  cycleAgent,
  cycleModel,
  logout,
  newSession,
  openMenu,
  setAgent,
  setModel,
  store,
  toast,
  useStore,
} from "./store";

/** Left/right or up/down navigable option list. */
function Picker({
  title,
  items,
  current,
  onPick,
}: {
  title: string;
  items: { key: string; label: string }[];
  current?: string;
  onPick: (key: string) => void;
}) {
  const [sel, setSel] = useState(Math.max(0, items.findIndex((i) => i.key === current)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => (s + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[sel];
        if (it) onPick(it.key);
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [items, sel]);

  return (
    <div className="overlay" onClick={() => closeMenu()}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title">{title}</div>
        <div className="overlay-list">
          {items.map((it, i) => (
            <div
              key={it.key}
              className={"overlay-item" + (i === sel ? " active" : "")}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                onPick(it.key);
                closeMenu();
              }}
            >
              {it.label}
              {it.key === current && <span className="muted small"> · current</span>}
            </div>
          ))}
          {items.length === 0 && <div className="muted small">none available</div>}
        </div>
        <div className="overlay-foot">↑↓ navigate · Enter select · Esc close</div>
      </div>
    </div>
  );
}

export function LeaderMenu() {
  useStore();
  const activeId = () => {
    const a = store.get().activeSessionId;
    return a && a !== "__new__" ? a : null;
  };

  const actions: { key: string; label: string; run: () => void }[] = [
    { key: "n", label: "New session", run: newSession },
    {
      key: "l",
      label: "Session list",
      run: () => {
        store.set({ activeSessionId: null, view: "chat" });
        closeMenu();
      },
    },
    { key: "m", label: "Change model", run: () => openMenu("models") },
    { key: "a", label: "Change agent", run: () => openMenu("agents") },
    {
      key: "t",
      label: "Terminal",
      run: () => {
        store.set({ view: "terminal" });
        closeMenu();
      },
    },
    {
      key: "c",
      label: "Compact session",
      run: async () => {
        closeMenu();
        const id = activeId(); if (!id) return toast("no active session");
        await api.summarize(id).then(() => toast("compacting…")).catch((e) => toast(String(e)));
      },
    },
    {
      key: "u",
      label: "Undo (revert last message)",
      run: async () => {
        closeMenu();
        const id = activeId(); if (!id) return toast("no active session");
        const entries = store.get().entries[id] ?? [];
        const lastUser = [...entries].reverse().find((e) => e.info?.role === "user");
        if (!lastUser) return toast("nothing to undo");
        await api.revert(id, lastUser.info.id).then(() => toast("reverted")).catch((e) => toast(String(e)));
      },
    },
    {
      key: "r",
      label: "Redo (restore reverted)",
      run: async () => {
        closeMenu();
        const id = activeId(); if (!id) return toast("no active session");
        await api.unrevert(id).then(() => toast("restored")).catch((e) => toast(String(e)));
      },
    },
    {
      key: "s",
      label: "Share session",
      run: async () => {
        closeMenu();
        const id = activeId(); if (!id) return toast("no active session");
        try {
          const r = await api.share(id);
          const url = r?.share?.url;
          if (url) {
            try {
              await navigator.clipboard.writeText(url);
            } catch {}
            toast(`share link copied: ${url}`);
          } else toast("shared");
        } catch (e) {
          toast(String(e));
        }
      },
    },
    { key: "?", label: "Help", run: () => openMenu("help") },
    {
      key: "q",
      label: "Log out",
      run: () => {
        closeMenu();
        logout();
      },
    },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const a = actions.find((x) => x.key === k);
      if (a) {
        e.preventDefault();
        a.run();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="overlay" onClick={() => closeMenu()}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title">
          Commands <span className="muted small">(ctrl+x)</span>
        </div>
        <div className="overlay-list">
          {actions.map((a) => (
            <div
              key={a.key}
              className="overlay-item"
              onClick={() => a.run()}
            >
              <span className="kbd">{a.key}</span> {a.label}
            </div>
          ))}
        </div>
        <div className="overlay-foot">press a key · Esc close</div>
      </div>
    </div>
  );
}

export function HelpOverlay() {
  return (
    <div className="overlay" onClick={() => closeMenu()}>
      <div className="overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title">Keyboard shortcuts</div>
        <div className="overlay-list">
          {[
            ["Tab", "Change agent"],
            ["Shift+Tab", "Change agent (reverse)"],
            ["Ctrl+X", "Commands menu"],
            ["/", "Slash commands"],
            ["Enter", "Send · Shift+Enter newline"],
            ["Ctrl+↑ / Ctrl+↓", "Change model"],
            ["Esc", "Close menu"],
          ].map(([k, v]) => (
            <div key={k} className="overlay-item">
              <span className="kbd">{k}</span> {v}
            </div>
          ))}
        </div>
        <div className="overlay-foot">Esc close</div>
      </div>
    </div>
  );
}

/** Global keyboard shortcuts + renders the active overlay. */
export default function Overlays() {
  const s = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // leader
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        openMenu(store.get().menu === "leader" ? null : "leader");
        return;
      }
      // model cycling
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp") {
        e.preventDefault();
        cycleModel(-1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") {
        e.preventDefault();
        cycleModel(1);
        return;
      }
      // agent cycling with Tab (skip when a menu is open)
      if (e.key === "Tab" && !store.get().menu) {
        e.preventDefault();
        cycleAgent(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (s.menu === "leader") return <LeaderMenu />;
  if (s.menu === "help") return <HelpOverlay />;
  if (s.menu === "models")
    return (
      <Picker
        title="Model"
        items={s.models.map((m) => ({ key: m.key, label: m.label }))}
        current={s.model}
        onPick={setModel}
      />
    );
  if (s.menu === "agents")
    return (
      <Picker
        title="Agent"
        items={s.agents.map((a) => ({ key: a, label: a }))}
        current={s.agent}
        onPick={setAgent}
      />
    );
  return null;
}
