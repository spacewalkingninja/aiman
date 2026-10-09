type LineType = "add" | "del" | "hunk" | "meta" | "ctx" | "skip";

type DiffLine = { type: LineType; text: string };

export function parseDiff(diff: string): DiffLine[] {
  return (diff ?? "").split("\n").map((line) => {
    if (line.startsWith("@@")) return { type: "hunk", text: line };
    if (line.startsWith("+++") || line.startsWith("---")) return { type: "meta", text: line };
    if (line.startsWith("+")) return { type: "add", text: line };
    if (line.startsWith("-")) return { type: "del", text: line };
    if (line.startsWith("\\")) return { type: "meta", text: line };
    if (line.startsWith("Index:") || line.startsWith("===")) return { type: "skip", text: line };
    return { type: "ctx", text: line };
  });
}

/** Build a unified diff for a whole-file write (mirrors the opencode TUI). */
export function synthWriteDiff(filePath: string, content: string): string {
  const lines = (content ?? "").split("\n");
  const path = filePath || "file";
  let out = `--- ${path}\n+++ ${path}\n@@ -0,0 +1,${lines.length} @@\n`;
  out += lines.map((l) => "+" + l).join("\n");
  return out;
}

export default function DiffView({ diff, path }: { diff: string; path?: string }) {
  const lines = parseDiff(diff);
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;
  return (
    <div className="diff-wrap">
      <div className="diff-stat">
        {path && <span className="diff-path">{path}</span>}
        <span className="diff-add">+{added}</span>
        <span className="diff-del">−{removed}</span>
      </div>
      <div className="diff">
        {lines.map((l, i) =>
          l.type === "skip" ? null : (
            <div key={i} className={"diff-line " + l.type}>
              {l.text || " "}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
