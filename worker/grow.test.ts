import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grow } from "./grow";
import { growBank, Rejected, type GrowBank } from "./growBank";
import { withGrowBalances, type Database, type Statement } from "./growLedger";
import { growAnalysis, defaultGrowSettings } from "../src/helpers/grow";
import type { SimState } from "../src/helpers/simTypes";
let ip = 0;
function request(body?: unknown, origin = "https://otto.test") {
  return new Request(
    "https://otto.test/_api/grow",
    body
      ? {
          method: "POST",
          headers: { Origin: origin, "CF-Connecting-IP": String(++ip) },
          body: JSON.stringify(body),
        }
      : undefined,
  );
}
function database(filename = ":memory:", initialize = true) {
  const sqlite = new DatabaseSync(filename);
  if (initialize)
    sqlite.exec(
      readFileSync(
        new URL("../drizzle/0000_curvy_white_tiger.sql", import.meta.url),
        "utf8",
      ),
    );
  let failReceipt = false;
  function prepare(sql: string): Statement {
    let values: any[] = [];
    return {
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
        if (failReceipt && sql.includes("SET receipt=")) {
          failReceipt = false;
          throw Error("storage failed after receipt");
        }
        return {
          meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
        };
      },
    };
  }
  const db: Database = {
    prepare,
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
  return {
    db,
    sqlite,
    failNextReceipt() {
      failReceipt = true;
    },
  };
}
function fixture() {
  const { db, sqlite, failNextReceipt } = database();
  let raw: SimState = {
      checking: 10000,
      savings: 1000,
      bills: [{ id: "rent", payee: "Rent", amount: 800, dueDay: 3 }],
      txns: [],
    },
    writes = 0,
    failSnapshot = false,
    mode = "ok",
    receiptMode = "ok";
  const records = new Map<string, any>();
  const bank: GrowBank = {
    async snapshot() {
      if (failSnapshot) throw Error("offline");
      return {
        state: {
          ...structuredClone(raw),
          purchaseSource: "nessie",
          warnings: [],
          reportingMonth: new Date().toISOString().slice(0, 7),
          observedPurchases: 0,
          sandboxAccounts: {
            checking: "fixed-checking",
            savings: "fixed-savings",
          },
          activeBills: structuredClone(raw.bills),
          oneTimeBillDates: {},
        },
        from: "fixed-checking",
        to: "fixed-savings",
      };
    },
    async create(amount, description, date, from) {
      assert.equal(from, "fixed-checking");
      writes++;
      if (mode === "rejected")
        throw new Rejected("Nessie rejected this transfer (HTTP 400).");
      const id = crypto.randomUUID();
      records.set(id, {
        id,
        amount,
        description,
        transaction_date: date,
        status: "completed",
      });
      if (mode === "timeout") throw Error("response lost");
      return id;
    },
    async balances() {
      return { checking: raw.checking, savings: raw.savings };
    },
    async receipt(id) {
      if (receiptMode === "offline") throw Error("offline");
      const r = { ...records.get(id) };
      if (receiptMode === "mismatch") r.amount++;
      if (receiptMode === "pending") r.status = "pending";
      if (receiptMode === "cancelled") r.status = "cancelled";
      return r;
    },
  };
  const env = { NESSIE_KEY: "fake-test-key", DB: db };
  const call = (body?: unknown, origin?: string) =>
    grow(request(body, origin), env, () => {}, bank);
  const preview = (amount = 100) =>
    call({
      action: "preview",
      amount,
      settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
      acknowledgeEstimate: true,
    });
  return {
    db,
    sqlite,
    bank,
    env,
    call,
    preview,
    failNextReceipt,
    get raw() {
      return raw;
    },
    setRaw(s: SimState) {
      raw = s;
    },
    get writes() {
      return writes;
    },
    mode(v: string) {
      mode = v;
    },
    receiptMode(v: string) {
      receiptMode = v;
    },
    offline() {
      failSnapshot = true;
    },
  };
}
async function quote(f: ReturnType<typeof fixture>, amount = 100) {
  const r = await f.preview(amount);
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()) as any;
}
const confirm = (q: any) => ({ action: "confirm", id: q.id, token: q.token });
const status = (q: any) => ({ ...confirm(q), action: "status" });
test("Grow persists one verified Nessie receipt and conserves balances across refreshes", async () => {
  const f = fixture(),
    q = await quote(f);
  assert.equal(f.writes, 0);
  const r = await f.call(confirm(q));
  assert.equal(((await r.json()) as any).status, "completed");
  const state = await withGrowBalances(f.raw, f.db);
  assert.equal(state.checking, 9900);
  assert.equal(state.savings, 1100);
  assert.equal(f.raw.checking, 10000);
  assert.equal(state.checking + state.savings, 11000);
  assert.equal(f.writes, 1);
  for (let i = 0; i < 10; i++) await f.call(confirm(q));
  assert.equal(f.writes, 1);
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9900);
  assert.equal(
    ((await (await f.call()).json()) as any).recent[0].status,
    "completed",
  );
});
test("50 simultaneous confirmations of one review create exactly one provider request", async () => {
  const f = fixture(),
    q = await quote(f);
  await Promise.all(Array.from({ length: 50 }, () => f.call(confirm(q))));
  assert.equal(f.writes, 1);
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9900);
});
test("40 stale competing reviews cannot drain the shared sandbox account", async () => {
  const f = fixture(),
    quotes = [];
  for (let i = 0; i < 40; i++) quotes.push(await quote(f, 1000));
  await Promise.all(quotes.map((q) => f.call(confirm(q))));
  assert.equal(f.writes, 1);
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9000);
});
test("Amounts, acknowledgements, arbitrary destinations and cross-origin requests are rejected", async () => {
  const f = fixture();
  for (const amount of [-1, 0, 0.1, 1.001, 1001, 1e12, null, "100"])
    assert.equal((await f.preview(amount as any)).status, 400);
  assert.equal(
    (
      await f.call({
        action: "preview",
        amount: 1,
        settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call({
        action: "preview",
        amount: 1,
        to: "attacker",
        settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
        acknowledgeEstimate: true,
      })
    ).status,
    400,
  );
  const q = await quote(f);
  assert.equal((await f.call(confirm(q), "https://evil.test")).status, 403);
  assert.equal(
    (await f.call({ ...confirm(q), token: "a".repeat(64) })).status,
    403,
  );
  assert.equal(f.writes, 0);
});
test("Stale balances, changed bills, expired reviews and offline checks cause no provider write", async () => {
  for (const failure of [
    "checking",
    "savings",
    "bills",
    "expired",
    "offline",
  ]) {
    const f = fixture(),
      q = await quote(f);
    if (failure === "checking") f.raw.checking--;
    if (failure === "savings") f.raw.savings++;
    if (failure === "bills") f.raw.bills[0].amount++;
    if (failure === "offline") f.offline();
    if (failure === "expired") {
      const row = f.sqlite
        .prepare("SELECT payload FROM grow_operations WHERE id=?")
        .get(q.id) as any;
      const p = JSON.parse(row.payload);
      p.expires = 0;
      f.sqlite
        .prepare("UPDATE grow_operations SET payload=? WHERE id=?")
        .run(JSON.stringify(p), q.id);
    }
    const r = await f.call(confirm(q));
    assert.ok(r.status >= 400);
    assert.equal(f.writes, 0);
    assert.equal(
      (await withGrowBalances(f.raw, f.db)).checking,
      f.raw.checking,
    );
  }
});
test("A timeout after provider acceptance never retries or falsely debits balances", async () => {
  const f = fixture(),
    q = await quote(f);
  f.mode("timeout");
  const r = await f.call(confirm(q));
  assert.equal(((await r.json()) as any).status, "uncertain");
  for (let i = 0; i < 5; i++) await f.call(confirm(q));
  assert.equal(f.writes, 1);
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 10000);
  assert.equal((await f.preview()).status, 409);
});
test("Receipt-read failures recover by reading the same receipt, without resending", async () => {
  const f = fixture(),
    q = await quote(f);
  f.receiptMode("offline");
  assert.equal(
    ((await (await f.call(confirm(q))).json()) as any).status,
    "uncertain",
  );
  f.receiptMode("ok");
  await Promise.all(Array.from({ length: 20 }, () => f.call(status(q))));
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9900);
  assert.equal(f.writes, 1);
});
test("Pending and mismatched receipts stay locked until verified; cancelled receipts release without debiting", async () => {
  for (const mode of ["pending", "mismatch", "cancelled"]) {
    const f = fixture(),
      q = await quote(f);
    f.receiptMode(mode);
    const r = (await (await f.call(confirm(q))).json()) as any;
    assert.equal((await withGrowBalances(f.raw, f.db)).checking, 10000);
    assert.equal(
      r.status,
      mode === "pending"
        ? "pending"
        : mode === "cancelled"
          ? "failed"
          : "uncertain",
    );
    if (mode !== "cancelled") {
      assert.equal((await f.preview()).status, 409);
      f.receiptMode("ok");
      await f.call(status(q));
      assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9900);
    }
    assert.equal(f.writes, 1);
  }
});
test("Definite provider rejection releases the lock, and a DB failure after writing freezes retries", async () => {
  const f = fixture(),
    q = await quote(f);
  f.mode("rejected");
  assert.equal(
    ((await (await f.call(confirm(q))).json()) as any).status,
    "failed",
  );
  f.mode("ok");
  const second = await quote(f);
  f.failNextReceipt();
  assert.equal(
    ((await (await f.call(confirm(second))).json()) as any).status,
    "uncertain",
  );
  await f.call(confirm(second));
  assert.equal(f.writes, 2);
  assert.equal((await f.preview()).status, 409);
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 10000);
});
let seed = 123456;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 200; i++)
  test(`Grow adversarial dataset ${i + 1}: cents, bills and buffer remain conserved`, async () => {
    const f = fixture();
    const state: SimState = {
      checking: Math.floor(random() * 500000) / 100,
      savings: Math.floor(random() * 500000) / 100,
      bills: Array.from({ length: Math.floor(random() * 10) }, (_, j) => ({
        id: String(j),
        payee: "Bill " + j,
        amount: Math.floor(random() * 150000) / 100,
        dueDay: 1 + Math.floor(random() * 30),
      })),
      txns: Array.from({ length: Math.floor(random() * 20) }, () => ({
        day: 1,
        type: "purchase",
        amount: Math.floor(random() * 5000) / 100,
        desc: "Purchase",
      })),
    };
    f.setRaw(state);
    const a = growAnalysis(state, "nessie", defaultGrowSettings),
      max = Math.min(1000, Math.floor(a.idle));
    if (max < 1) {
      assert.equal((await f.preview(1)).status, 409);
      assert.equal(f.writes, 0);
      return;
    }
    const amount = 1 + Math.floor(random() * max),
      q = await quote(f, amount);
    assert.equal(
      ((await (await f.call(confirm(q))).json()) as any).status,
      "completed",
    );
    const after = await withGrowBalances(state, f.db);
    assert.equal(
      Math.round(after.checking * 100) + Math.round(after.savings * 100),
      Math.round(state.checking * 100) + Math.round(state.savings * 100),
    );
    assert.ok(after.checking + 0.001 >= a.reserve);
    assert.equal(f.writes, 1);
    f.sqlite.close();
  });
test("Actual Nessie adapter uses the deployed contract and normalizes _id/create versus id/read", async () => {
  const calls: any[] = [];
  const provider = growBank("secret", (async (
    input: any,
    init?: RequestInit,
  ) => {
    const u = new URL(input);
    calls.push({
      path: u.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (init?.method === "POST")
      return Response.json({ objectCreated: { _id: "receipt-id" } });
    return Response.json({ id: "receipt-id", amount: 1 });
  }) as typeof fetch);
  const id = await provider.create(
    1,
    "approved-memo",
    "2026-10-17",
    "seeded-checking",
  );
  assert.equal(id, "receipt-id");
  assert.deepEqual(calls[0], {
    path: "/accounts/seeded-checking/transfers",
    body: {
      amount: 1,
      status: "completed",
      transaction_date: "2026-10-17",
      description: "approved-memo",
    },
  });
  assert.equal((await provider.receipt(id)).id, id);
});
test("Missing storage fails closed without making provider requests", async () => {
  assert.equal(
    ((await (await grow(request(), {})).json()) as any).transfersSupported,
    false,
  );
  assert.equal(
    (await grow(request({ action: "preview" }), { NESSIE_KEY: "key" })).status,
    503,
  );
});

test("Ledger survives a database connection restart without repeating the provider write", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otto-grow-test-")),
    path = join(folder, "ledger.sqlite");
  const first = database(path);
  const f = fixture();
  try {
    const env = { ...f.env, DB: first.db };
    const preview = await grow(
      request({
        action: "preview",
        amount: 100,
        settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
        acknowledgeEstimate: true,
      }),
      env,
      () => {},
      f.bank,
    );
    const q = (await preview.json()) as any;
    await grow(request(confirm(q)), env, () => {}, f.bank);
    first.sqlite.close();
    const reopened = database(path, false);
    try {
      assert.equal((await withGrowBalances(f.raw, reopened.db)).checking, 9900);
      await grow(
        request(confirm(q)),
        { ...env, DB: reopened.db },
        () => {},
        f.bank,
      );
      assert.equal(f.writes, 1);
    } finally {
      reopened.sqlite.close();
    }
  } finally {
    f.sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("Oversized bodies, malformed JSON, invalid dates and duplicate manual IDs fail without moving funds", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call({
        action: "preview",
        amount: 1,
        settings: { nextPayday: "not-a-date", buffer: 200, emergencyMonths: 3 },
        acknowledgeEstimate: true,
      })
    ).status,
    400,
  );
  const oversized = new Request("https://otto.test/_api/grow", {
    method: "POST",
    headers: { Origin: "https://otto.test" },
    body: "x".repeat(20001),
  });
  assert.equal((await grow(oversized, f.env, () => {}, f.bank)).status, 413);
  assert.equal(
    (
      await grow(
        new Request("https://otto.test/_api/grow", {
          method: "POST",
          headers: { Origin: "https://otto.test" },
          body: "{bad",
        }),
        f.env,
        () => {},
        f.bank,
      )
    ).status,
    400,
  );
  assert.equal(f.writes, 0);
});

test("Unexpected native settlement cannot also debit the OTTO ledger", async () => {
  const f = fixture(),
    q = await quote(f);
  f.receiptMode("offline");
  await f.call(confirm(q));
  f.raw.checking -= 100;
  f.raw.savings += 100;
  f.receiptMode("ok");
  const r = (await (await f.call(status(q))).json()) as any;
  assert.equal(r.status, "uncertain");
  assert.equal((await withGrowBalances(f.raw, f.db)).checking, 9900);
  assert.equal(f.writes, 1);
  assert.equal((await f.preview()).status, 409);
});
test("Manual costs remain reserved even when native active-bill metadata is present", async () => {
  const f = fixture();
  f.raw.checking = 1500;
  const r = await f.call({
    action: "preview",
    amount: 100,
    settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
    manualBills: [
      { id: "manual:extra", payee: "Added bill", amount: 1000, dueDay: 20 },
    ],
    acknowledgeEstimate: true,
  });
  assert.equal(r.status, 409);
  assert.equal(f.writes, 0);
  const b = { id: "same", payee: "A", amount: 1, dueDay: 3 };
  assert.equal(
    (
      await f.call({
        action: "preview",
        amount: 1,
        settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
        manualBills: [b, { ...b, payee: "B" }],
        acknowledgeEstimate: true,
      })
    ).status,
    400,
  );
});

test("Distinct Unicode manual bills are not merged into one cheaper expense", async () => {
  const f = fixture();
  f.raw.checking = 2500;
  const r = await f.call({
    action: "preview",
    amount: 300,
    settings: { nextPayday: "", buffer: 200, emergencyMonths: 3 },
    manualBills: [
      { id: "a", payee: "電話", amount: 1000, dueDay: 20 },
      { id: "b", payee: "電気", amount: 300, dueDay: 21 },
    ],
    acknowledgeEstimate: true,
  });
  assert.equal(r.status, 409);
  assert.equal(f.writes, 0);
});
