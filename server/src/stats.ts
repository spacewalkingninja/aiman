import { ocRO } from "./db";

export type Usage = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  messages: number;
};

function empty(): Usage {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    cost: 0,
    messages: 0,
  };
}

function add(a: Usage, b: Partial<Usage>): Usage {
  a.input += b.input ?? 0;
  a.output += b.output ?? 0;
  a.reasoning += b.reasoning ?? 0;
  a.cacheRead += b.cacheRead ?? 0;
  a.cacheWrite += b.cacheWrite ?? 0;
  a.cost += b.cost ?? 0;
  a.messages += b.messages ?? 0;
  a.total = a.input + a.output + a.reasoning;
  return a;
}

const AGG = `
  IFNULL(SUM(json_extract(data,'$.tokens.input')),0)       AS input,
  IFNULL(SUM(json_extract(data,'$.tokens.output')),0)      AS output,
  IFNULL(SUM(json_extract(data,'$.tokens.reasoning')),0)   AS reasoning,
  IFNULL(SUM(json_extract(data,'$.tokens.cache.read')),0)  AS cacheRead,
  IFNULL(SUM(json_extract(data,'$.tokens.cache.write')),0) AS cacheWrite,
  IFNULL(SUM(json_extract(data,'$.cost')),0)               AS cost,
  COUNT(*)                                                 AS messages
`;

const WHERE_ASSISTANT = "json_extract(data,'$.role') = 'assistant'";

export function usageBySession(): Map<string, Usage> {
  const rows = ocRO
    .query(
      `SELECT session_id AS sid, ${AGG} FROM message WHERE ${WHERE_ASSISTANT} GROUP BY session_id`,
    )
    .all() as any[];
  const map = new Map<string, Usage>();
  for (const r of rows) {
    const u = add(empty(), r);
    map.set(r.sid, u);
  }
  return map;
}

export function usageByModel(sessionId?: string): any[] {
  const where = sessionId ? `${WHERE_ASSISTANT} AND session_id = ?` : WHERE_ASSISTANT;
  const rows = (sessionId
    ? ocRO.query(
        `SELECT json_extract(data,'$.providerID') AS providerID,
                json_extract(data,'$.modelID') AS modelID, ${AGG}
         FROM message WHERE ${where}
         GROUP BY providerID, modelID ORDER BY cost DESC`,
      ).all(sessionId)
    : ocRO.query(
        `SELECT json_extract(data,'$.providerID') AS providerID,
                json_extract(data,'$.modelID') AS modelID, ${AGG}
         FROM message WHERE ${where}
         GROUP BY providerID, modelID ORDER BY cost DESC`,
      ).all()) as any[];
  return rows.map((r) => {
    const u = add(empty(), r);
    return { providerID: r.providerID ?? "unknown", modelID: r.modelID ?? "unknown", ...u };
  });
}

export function usageByDay(): any[] {
  const rows = ocRO
    .query(
      `SELECT date(time_created/1000,'unixepoch') AS day, ${AGG}
       FROM message WHERE ${WHERE_ASSISTANT} GROUP BY day ORDER BY day DESC LIMIT 60`,
    )
    .all() as any[];
  return rows
    .map((r) => {
      const u = add(empty(), r);
      return { day: r.day, ...u };
    })
    .reverse();
}

export function sessionStats(sessionId: string) {
  const models = usageByModel(sessionId);
  const totals = empty();
  for (const m of models) add(totals, m);
  const userMessages = (
    ocRO
      .query(
        `SELECT COUNT(*) AS n FROM message WHERE session_id = ? AND json_extract(data,'$.role') = 'user'`,
      )
      .get(sessionId) as { n: number }
  ).n;
  return { sessionId, totals, userMessages, models };
}

export function aggregateStats() {
  const models = usageByModel();
  const totals = empty();
  for (const m of models) add(totals, m);
  const days = usageByDay();
  const counts = ocRO
    .query(
      `SELECT
         (SELECT COUNT(*) FROM session) AS sessions,
         (SELECT COUNT(*) FROM session WHERE time_archived IS NOT NULL) AS archived,
         (SELECT COUNT(*) FROM message WHERE json_extract(data,'$.role') = 'user') AS userMessages`,
    )
    .get() as any;
  return {
    totals: {
      ...totals,
      sessions: counts.sessions,
      archived: counts.archived,
      userMessages: counts.userMessages,
    },
    models,
    days,
  };
}
