import { useEffect, useState } from "react";
import { api, type Session, type Stats } from "./api";
import { openSession, store, toast, useStore } from "./store";

export function fmtTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function fmtCost(n: number): string {
  if (!n) return "$0";
  if (n < 0.01) return "$" + n.toFixed(5);
  return "$" + n.toFixed(2);
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export default function StatsView() {
  const s = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, sess] = await Promise.all([
          api.stats(),
          api.sessions({ archived: "all" }),
        ]);
        setStats(st);
        store.set({ sessions: sess });
      } catch (e) {
        toast(`Failed to load stats: ${e}`);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  if (busy || !stats) return <div className="empty">loading stats…</div>;

  const t = stats.totals;
  const maxDay = Math.max(1, ...stats.days.map((d) => d.total));
  const topSessions: Session[] = [...s.sessions]
    .filter((x) => x.usage)
    .sort((a, b) => (b.usage?.total ?? 0) - (a.usage?.total ?? 0))
    .slice(0, 15);

  return (
    <div className="search-wrap" style={{ maxWidth: 1100 }}>
      <h2 style={{ marginTop: 0 }}>Usage statistics</h2>

      <div className="stat-grid">
        <Card label="Sessions" value={String(t.sessions)} sub={`${t.archived} archived`} />
        <Card label="Assistant messages" value={String(t.messages)} sub={`${t.userMessages} user`} />
        <Card
          label="Total tokens"
          value={fmtTokens(t.total)}
          sub={`${fmtTokens(t.input)} in · ${fmtTokens(t.output)} out · ${fmtTokens(t.reasoning)} think`}
        />
        <Card label="Total cost" value={fmtCost(t.cost)} sub="provider spend" />
        <Card
          label="Cache"
          value={fmtTokens(t.cacheRead + t.cacheWrite)}
          sub={`${fmtTokens(t.cacheRead)} read · ${fmtTokens(t.cacheWrite)} write`}
        />
      </div>

      <h3>By model</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Provider / model</th>
            <th>Msgs</th>
            <th>Input</th>
            <th>Output</th>
            <th>Thinking</th>
            <th>Cache</th>
            <th>Total</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {stats.models.map((m) => (
            <tr key={m.providerID + "/" + m.modelID}>
              <td style={{ textAlign: "left" }}>
                <span className="muted">{m.providerID}</span> / <b>{m.modelID}</b>
              </td>
              <td style={{ textAlign: "center" }}>{m.messages}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.input)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.output)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.reasoning)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.cacheRead + m.cacheWrite)}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(m.total)}</td>
              <td style={{ textAlign: "center" }}>{fmtCost(m.cost)}</td>
            </tr>
          ))}
          {stats.models.length === 0 && (
            <tr>
              <td colSpan={8} className="muted small">
                no usage yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Daily activity</h3>
      <div className="bars">
        {stats.days.length === 0 && <div className="muted small">no data</div>}
        {stats.days.map((d) => (
          <div className="bar-col" key={d.day} title={`${d.day}: ${fmtTokens(d.total)} tokens, ${fmtCost(d.cost)}`}>
            <div className="bar" style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }} />
            <div className="bar-x">{d.day.slice(5)}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Top sessions by tokens</h3>
      <table className="markdown" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Session</th>
            <th>Msgs</th>
            <th>Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {topSessions.map((x) => (
            <tr
              key={x.id}
              style={{ cursor: "pointer" }}
              onClick={() => {
                store.set({ view: "chat" });
                openSession(x.id);
              }}
            >
              <td style={{ textAlign: "left" }}>{x.title || "(untitled)"}</td>
              <td style={{ textAlign: "center" }}>{x.usage?.messages ?? 0}</td>
              <td style={{ textAlign: "center" }}>{fmtTokens(x.usage?.total ?? 0)}</td>
              <td style={{ textAlign: "center" }}>{fmtCost(x.usage?.cost ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
