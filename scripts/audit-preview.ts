// Isolated QA server. No credentials and no external banking requests.
import { createServer } from "vite";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import superjson from "superjson";
import { fakeMonth } from "../src/helpers/fakeMonth";
import { chat } from "../worker/chat";
import { grow } from "../worker/grow";
import {
  withGrowBalances,
  type Database,
  type Statement,
} from "../worker/growLedger";
import type { GrowBank } from "../worker/growBank";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("drizzle/0000_curvy_white_tiger.sql", "utf8"));
const db: Database = {
  prepare(sql) {
    let values: any[] = [];
    const stmt: Statement = {
      bind(...args) {
        values = args;
        return this;
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...values) || null) as T | null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...values) as T[] };
      },
      async run() {
        return {
          meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
        };
      },
    };
    return stmt;
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const r = [];
      for (const s of statements) r.push(await s.run());
      sqlite.exec("COMMIT");
      return r;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
const raw = { ...structuredClone(fakeMonth), checking: 5000, savings: 1500 };
const records = new Map<string, any>();
const bank: GrowBank = {
  async snapshot() {
    return {
      state: {
        ...structuredClone(raw),
        sandboxAccounts: { checking: "qa-checking", savings: "qa-savings" },
        activeBills: structuredClone(raw.bills),
        oneTimeBillDates: {},
        purchaseSource: "nessie",
        observedPurchases: raw.txns.filter((t) => t.type === "purchase").length,
        reportingMonth: "2026-10",
        warnings: [],
      },
      from: "qa-checking",
      to: "qa-savings",
    };
  },
  async create(amount, description, date) {
    const id = crypto.randomUUID();
    records.set(id, {
      id,
      amount,
      description,
      transaction_date: date,
      status: "completed",
    });
    return id;
  },
  async balances() {
    return { checking: raw.checking, savings: raw.savings };
  },
  async receipt(id) {
    return records.get(id);
  },
};
let retrySeen = false;
async function handleQa(req: any, res: any, next: any) {
  if (!req.url?.startsWith("/_api/")) return next();
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const request = new Request("http://127.0.0.1:3002" + req.url, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method || "GET")
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    if (req.url === "/_api/chat" && req.method === "POST") {
      const b: any = superjson.parse(Buffer.concat(chunks).toString());
      const q = b.messages?.at(-1)?.content;
      if (q === "QA retry please" && !retrySeen) {
        retrySeen = true;
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(superjson.stringify({ error: "Temporary QA outage" }));
        return;
      }
      if (q === "QA slow reply")
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    const env = { NESSIE_KEY: "fake-qa-only", DB: db };
    const state = async () =>
      withGrowBalances((await bank.snapshot()).state, db);
    const result =
      req.url === "/_api/nessie"
        ? new Response(superjson.stringify({ state: await state() }), {
            headers: { "Content-Type": "application/json" },
          })
        : req.url === "/_api/grow"
          ? await grow(request, env, () => {}, bank)
          : req.url === "/_api/chat"
            ? await chat(request, {}, state)
            : new Response("Not found", { status: 404 });
    res.statusCode = result.status;
    result.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "QA server failed" }));
  }
}
const server = await createServer({
  plugins: [
    {
      name: "isolated-qa-api",
      configureServer(s) {
        s.middlewares.use(handleQa);
      },
    },
  ],
  server: { port: 3002, strictPort: true, host: "127.0.0.1" },
});
await server.listen();
server.printUrls();
