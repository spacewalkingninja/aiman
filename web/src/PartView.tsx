import { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Part } from "./api";
import DiffView, { synthWriteDiff } from "./DiffView";

function md(text: string) {
  const html = marked.parse(text ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html);
}

function Collapse({
  head,
  children,
  className = "",
  defaultOpen = false,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"card " + className}>
      <div className="card-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"}</span>
        {head}
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

export default function PartView({ part }: { part: Part }) {
  switch (part.type) {
    case "text": {
      if (part.ignored || part.synthetic) return null;
      return <div className="markdown" dangerouslySetInnerHTML={{ __html: md(part.text ?? "") }} />;
    }
    case "reasoning": {
      return (
        <Collapse
          className="thinking"
          head={<span className="name">Thinking</span>}
          defaultOpen={false}
        >
          <div className="markdown" dangerouslySetInnerHTML={{ __html: md(part.text ?? "") }} />
        </Collapse>
      );
    }
    case "tool": {
      const st = part.state ?? {};
      const status = st.status ?? "pending";
      const meta = st.metadata ?? {};
      const inp = st.input ?? {};
      const filePath: string | undefined = inp.filePath ?? inp.path ?? meta.filepath;
      const output = st.output ?? st.error ?? "";

      let diffText: string | null = null;
      if (typeof meta.diff === "string" && meta.diff.trim()) diffText = meta.diff;
      else if (part.tool === "write" && typeof inp.content === "string")
        diffText = synthWriteDiff(filePath ?? "file", inp.content);

      if (diffText) {
        const base = filePath ? filePath.split("/").slice(-1)[0] : "";
        return (
          <Collapse
            className="tool"
            defaultOpen={status !== "error"}
            head={
              <>
                <span className="name">{part.tool}</span>
                <span className={"badge " + status}>{status}</span>
                <span className="muted small" title={filePath}>
                  {base || st.title || ""}
                </span>
              </>
            }
          >
            <DiffView diff={diffText} path={filePath} />
            {st.error && output && <pre style={{ marginTop: 8 }}>{output}</pre>}
          </Collapse>
        );
      }

      const input = st.input ? JSON.stringify(st.input, null, 2) : "";
      return (
        <Collapse
          className="tool"
          defaultOpen={status === "running" || status === "error"}
          head={
            <>
              <span className="name">{part.tool}</span>
              <span className={"badge " + status}>{status}</span>
              {st.title && <span className="muted small">{st.title}</span>}
            </>
          }
        >
          {input && (
            <>
              <div className="small muted">input</div>
              <pre>{input}</pre>
            </>
          )}
          {output && (
            <>
              <div className="small muted" style={{ marginTop: 8 }}>
                {st.error ? "error" : "output"}
              </div>
              <pre>{output}</pre>
            </>
          )}
        </Collapse>
      );
    }
    case "file": {
      if (part.mime?.startsWith("image/"))
        return <img src={part.url} alt={part.filename ?? ""} style={{ maxWidth: 420, borderRadius: 8 }} />;
      return (
        <div className="small">
          <a href={part.url} target="_blank" rel="noreferrer">
            📎 {part.filename ?? part.url}
          </a>
        </div>
      );
    }
    case "patch": {
      return (
        <Collapse head={<span className="name">patch · {(part.files ?? []).length} files</span>}>
          <pre>{(part.files ?? []).join("\n")}</pre>
        </Collapse>
      );
    }
    case "step-finish": {
      const tk = part.tokens ?? {};
      return (
        <div className="step">
          step · {part.reason} · in {tk.input ?? 0} / out {tk.output ?? 0} / reason {tk.reasoning ?? 0}
          {typeof part.cost === "number" && part.cost > 0 ? ` · $${part.cost.toFixed(4)}` : ""}
        </div>
      );
    }
    case "step-start":
      return null;
    case "agent":
      return <div className="step">agent: {part.name}</div>;
    case "subtask":
      return (
        <Collapse head={<span className="name">subtask · {part.agent}</span>}>
          <div className="small muted">{part.description}</div>
          <pre>{part.prompt}</pre>
        </Collapse>
      );
    case "compaction":
      return <div className="step">— context compacted —</div>;
    default:
      return null;
  }
}
