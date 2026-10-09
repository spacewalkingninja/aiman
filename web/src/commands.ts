import { api } from "./api";
import {
  closeMenu,
  logout,
  newSession,
  openMenu,
  store,
  toast,
} from "./store";

export type BuiltinCmd = { name: string; description: string };

export const BUILTINS: BuiltinCmd[] = [
  { name: "new", description: "Start a new session" },
  { name: "sessions", description: "Go to session list" },
  { name: "models", description: "Change model" },
  { name: "agents", description: "Change agent" },
  { name: "compact", description: "Summarize / compact this session" },
  { name: "undo", description: "Revert the last message" },
  { name: "redo", description: "Restore reverted messages" },
  { name: "share", description: "Share this session (copy link)" },
  { name: "unshare", description: "Stop sharing this session" },
  { name: "terminal", description: "Open the terminal tab" },
  { name: "stats", description: "Open usage statistics" },
  { name: "help", description: "Keyboard shortcuts" },
  { name: "clear", description: "Clear the input" },
  { name: "logout", description: "Log out" },
];

const activeId = () => {
  const a = store.get().activeSessionId;
  return a && a !== "__new__" ? a : null;
};

/** Run a built-in slash command. Returns true if handled. */
export async function runBuiltin(name: string): Promise<boolean> {
  const id = activeId();
  switch (name) {
    case "new":
      await newSession();
      return true;
    case "sessions":
      store.set({ activeSessionId: null, view: "chat" });
      closeMenu();
      return true;
    case "models":
      openMenu("models");
      return true;
    case "agents":
      openMenu("agents");
      return true;
    case "terminal":
      store.set({ view: "terminal" });
      return true;
    case "stats":
      store.set({ view: "stats" });
      return true;
    case "help":
      openMenu("help");
      return true;
    case "clear":
      return true;
    case "logout":
      logout();
      return true;
    case "compact":
      if (!id) return toast("no active session"), true;
      await api.summarize(id).then(() => toast("compacting…")).catch((e) => toast(String(e)));
      return true;
    case "undo": {
      if (!id) return toast("no active session"), true;
      const entries = store.get().entries[id] ?? [];
      const lastUser = [...entries].reverse().find((e) => e.info?.role === "user");
      if (!lastUser) return toast("nothing to undo"), true;
      await api.revert(id, lastUser.info.id).then(() => toast("reverted")).catch((e) => toast(String(e)));
      return true;
    }
    case "redo":
      if (!id) return toast("no active session"), true;
      await api.unrevert(id).then(() => toast("restored")).catch((e) => toast(String(e)));
      return true;
    case "share": {
      if (!id) return toast("no active session"), true;
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
      return true;
    }
    case "unshare":
      if (!id) return toast("no active session"), true;
      await api.unshare(id).then(() => toast("unshared")).catch((e) => toast(String(e)));
      return true;
    default:
      return false;
  }
}
