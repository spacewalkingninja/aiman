import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Usage } from "./api";
import { BUILTINS, runBuiltin } from "./commands";
import { abortSession, sendPrompt, setAgent, setModel, store, toast, useStore } from "./store";
import { fmtCost, fmtTokens } from "./StatsView";

type Cmd = { name: string; description: string; custom?: boolean; args?: boolean };

export default function Composer({ sessionId }: { sessionId: string }) {
  const s = useStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState<Cmd[]>([]);
  const [palSel, setPalSel] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .commands()
      .then((cs) =>
        setCustom(
          (cs ?? []).map((c) => ({
            name: c.name,
            description: c.description ?? "",
            custom: true,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  // slash palette visibility
  const slashMatch = text.match(/^\/([\w-]*)$/);
  const paletteOpen = !!slashMatch && !s.menu;
  const query = (slashMatch?.[1] ?? "").toLowerCase();
  const allCmds: Cmd[] = useMemo(
    () => [...BUILTINS.map((b) => ({ ...b })), ...custom],
    [custom],
  );
  const filtered = useMemo(
    () => allCmds.filter((c) => c.name.toLowerCase().startsWith(query)).slice(0, 12),
    [allCmds, query],
  );

  useEffect(() => setPalSel(0), [query]);

  const status = s.statuses[sessionId];
  const busy = status && status.type !== "idle";
  const usage: Usage | null | undefined = s.sessions.find((x) => x.id === sessionId)?.usage;

  async function send() {
    const value = text.trim();
    if (!value || sending) return;

    // slash command?
    if (value.startsWith("/")) {
      const m = value.match(/^\/([\w-]+)\s*([\s\S]*)$/);
      if (m) {
        const name = m[1]!;
        const args = (m[2] ?? "").trim();
        setText("");
        if (await runBuiltin(name)) return;
        // custom command
        try {
          setSending(true);
          await api.commandRun(sessionId, {
            command: name,
            arguments: args,
            agent: s.agent,
            model: s.model,
          });
        } catch (e) {
          toast(`Command failed: ${e}`);
        } finally {
          setSending(false);
        }
        return;
      }
    }

    setSending(true);
    try {
      const m = s.models.find((x) => x.key === s.model);
      await sendPrompt(sessionId, value, {
        model: m ? { providerID: m.providerID, modelID: m.modelID } : undefined,
        agent: s.agent || undefined,
      });
      setText("");
    } catch (e) {
      alert(`Send failed: ${e}`);
    } finally {
      setSending(false);
    }
  }

  function pickCommand(c: Cmd) {
    // parameterless built-ins run immediately; everything else gets inserted
    const paramless = ["new", "sessions", "models", "agents", "compact", "undo", "redo", "share", "unshare", "terminal", "stats", "help", "logout"];
    if (c.custom || !paramless.includes(c.name)) {
      setText("/" + c.name + " ");
      taRef.current?.focus();
    } else if (c.name === "clear") {
      setText("");
    } else {
      setText("");
      runBuiltin(c.name);
    }
  }

  return (
    <div className="composer">
      {paletteOpen && (
        <div className="palette">
          {filtered.map((c, i) => (
            <div
              key={c.name}
              className={"palette-item" + (i === palSel ? " active" : "")}
              onMouseEnter={() => setPalSel(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pickCommand(c);
              }}
            >
              <span className="palette-name">/{c.name}</span>
              <span className="muted small">{c.description}</span>
              {c.custom && <span className="badge">command</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-item muted">no matching command</div>}
        </div>
      )}

      <textarea
        ref={taRef}
        value={text}
        placeholder="Message opencode…  (Enter to send · Shift+Enter newline · / for commands · Tab changes agent)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (paletteOpen) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setPalSel((i) => (i + 1) % Math.max(1, filtered.length));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setPalSel((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              const c = filtered[palSel];
              if (c) pickCommand(c);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="composer-row">
        <select
          className="input"
          value={s.model}
          onChange={(e) => setModel(e.target.value)}
          title="Model (ctrl+↑ / ctrl+↓)"
        >
          {s.models.length === 0 && <option value={s.model}>{s.model}</option>}
          {s.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={s.agent}
          onChange={(e) => setAgent(e.target.value)}
          title="Agent (Tab to cycle)"
        >
          {s.agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {usage && usage.total > 0 && (
          <span className="muted small" title="session tokens · cost">
            {fmtTokens(usage.total)} tok · {fmtCost(usage.cost)}
          </span>
        )}
        <div className="spacer" />
        {busy && (
          <button className="btn danger" onClick={() => abortSession(sessionId)}>
            ■ Stop
          </button>
        )}
        <button className="btn primary" disabled={sending || !text.trim()} onClick={send}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
