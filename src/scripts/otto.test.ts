import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeMonth } from "../helpers/fakeMonth";
import {
  defaultHabits,
  projectFuture,
  spendingProfile,
} from "../helpers/projectFuture";
import {
  executeOnce,
  type ActionReceipt,
  type ActionLedger,
} from "../helpers/executeOnce";
import { transferGuard } from "../helpers/transferGuard";
import { changeWorkspace } from "../helpers/changeWorkspace";
import { runSimulation } from "../helpers/runSimulation";
import type { Workspace } from "../helpers/ottoWorkspace";
import { subscriptionProvider } from "../helpers/subscriptions";
import { aiReplyText } from "../helpers/aiReplyText";
const state = structuredClone(fakeMonth),
  base = defaultHabits(state);
test("baseline preserves inputs and spans exactly 120 months", () => {
  const copy = structuredClone(state),
    result = projectFuture(state, base);
  assert.deepEqual(state, copy);
  assert.equal(result.points.length, 121);
  assert.equal(result.points[0].year, 2026);
  assert.equal(result.end.year, 2036);
  assert.equal(result.points[0].netWorth, state.checking + state.savings);
  assert.equal(projectFuture(state, base).end.netWorth, result.end.netWorth);
});
test("internal transfers never masquerade as income or recurring spending", () => {
  const a = spendingProfile(state),
    b = spendingProfile({
      ...state,
      txns: state.txns.filter((t) => t.type !== "transfer"),
    });
  assert.deepEqual(a, b);
  const expected =
    state.bills.reduce((s, b) => s + b.amount, 0) +
    state.txns
      .filter((t) => t.type === "purchase")
      .reduce((s, t) => s + t.amount, 0);
  assert.ok(Math.abs(a.spending - expected) < 1e-6);
  assert.ok(Math.abs(projectFuture(state, base).spending - expected) < 0.011);
});
test("reducing delivery increases future net worth", () => {
  assert.ok(
    projectFuture(state, { ...base, delivery: 0 }).end.netWorth >
      projectFuture(state, base).end.netWorth,
  );
});
test("moving cash to savings does not create principal", () => {
  const noIncome = { checking: 1000, savings: 0, bills: [], txns: [] };
  const p = projectFuture(noIncome, {
    delivery: 0,
    coffee: 0,
    invest: 0,
    savePerPayday: 100,
  });
  for (const point of p.points)
    assert.ok(point.netWorth <= 1000 * Math.pow(1.03, point.month / 12) + 0.01);
  assert.ok(p.end.checking >= 200);
});
test("oversubscribed goals are flagged and funded only with available cash", () => {
  const p = projectFuture(state, { ...base, invest: 1000, savePerPayday: 500 });
  assert.equal(p.feasible, false);
  assert.ok(p.points.every((v) => v.checking >= 200));
  assert.ok(p.end.netWorth < 100000);
});
test("model permits a stressed negative trajectory without inventing a bailout", () => {
  const p = projectFuture(
    { ...state, checking: 0, savings: 0, txns: [] },
    base,
  );
  assert.equal(p.mood, "stressed");
  assert.ok(p.end.netWorth < 0);
  assert.equal(p.end.investments, 0);
});
test("workspace limits forks, protects a committed fork, and supports pause", () => {
  let w: Workspace = { forks: [], subscriptionRequests: {} };
  for (let i = 0; i < 3; i++)
    w = changeWorkspace(
      w,
      { action: "fork", name: "Fork " + i, habits: base, source: "demo" },
      String(i),
      "now",
    );
  assert.throws(
    () =>
      changeWorkspace(
        w,
        { action: "fork", name: "Fourth", habits: base, source: "demo" },
        "4",
        "now",
      ),
    /three/,
  );
  w = changeWorkspace(w, { action: "commit", id: "0" }, "", "now");
  assert.throws(
    () => changeWorkspace(w, { action: "remove", id: "0" }, "", "now"),
    /Pause/,
  );
  w = changeWorkspace(w, { action: "pause" }, "", "now");
  w = changeWorkspace(w, { action: "remove", id: "0" }, "", "now");
  assert.equal(w.forks.length, 2);
});
function ledger() {
  const rows = new Map<string, ActionReceipt>();
  const store: ActionLedger = {
    reserve: async (k) => {
      if (rows.has(k)) return { created: false, receipt: rows.get(k)! };
      const receipt = { status: "pending", detail: "Processing" };
      rows.set(k, receipt);
      return { created: true, receipt };
    },
    finish: async (k, r) => {
      rows.set(k, r);
    },
  };
  return store;
}
test("duplicate simultaneous submissions call the provider only once", async () => {
  const store = ledger();
  let calls = 0;
  const run = async () => {
    calls++;
    return { status: "submitted", detail: "Accepted", externalId: "receipt-1" };
  };
  await Promise.all([
    executeOnce("same", store, run),
    executeOnce("same", store, run),
  ]);
  const again = await executeOnce("same", store, run);
  assert.equal(calls, 1);
  assert.equal(again.externalId, "receipt-1");
});
test("ambiguous provider results are recorded and never automatically retried", async () => {
  const store = ledger();
  let calls = 0;
  const run = async () => {
    calls++;
    throw new Error("timeout after send");
  };
  assert.equal((await executeOnce("timeout", store, run)).status, "unknown");
  await executeOnce("timeout", store, run);
  assert.equal(calls, 1);
});
test("transfer guards reject invalid amounts and retain the checking buffer", () => {
  for (const n of [0, -1, 501, NaN, Infinity, 1.001])
    assert.throws(() => transferGuard(n, 1400));
  assert.throws(() => transferGuard(201, 400));
  assert.doesNotThrow(() => transferGuard(200, 400));
  assert.doesNotThrow(() => transferGuard(0.29, 1400));
});
test("essential bills never become cancelable subscriptions", () => {
  for (const b of state.bills.filter((b) => !/spotify/i.test(b.payee)))
    assert.equal(subscriptionProvider(b), null);
  assert.equal(
    subscriptionProvider(state.bills.find((b) => /spotify/i.test(b.payee))!)
      ?.name,
    "Spotify",
  );
});
test("AI response parser supports both response text formats", () => {
  assert.equal(aiReplyText({ output_text: " Hello " }), "Hello");
  assert.equal(
    aiReplyText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "Future you" }],
        },
      ],
    }),
    "Future you",
  );
});
test("original month still contrasts manual overdrafts with full autonomy", () => {
  const manual = runSimulation(state, 0),
    agent = runSimulation(state, 4);
  assert.equal(manual.decisions.length, 0);
  assert.equal(manual.dailyBalances.find((b) => b.checking < 0)?.day, 10);
  assert.equal(agent.dailyBalances.filter((b) => b.checking < 0).length, 0);
  assert.equal(agent.score.scamsBlocked, 1);
  assert.equal(agent.score.interventions, 0);
});

// Mock transport only: these tests never send a network request or move sandbox funds.
test("Nessie writes use the reviewed method and accept plain-text success", async () => {
  const { nessieApi } = await import("../helpers/nessieApi");
  const originalFetch = globalThis.fetch,
    originalKey = process.env.NESSIE_KEY;
  process.env.NESSIE_KEY = "local-test-placeholder";
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return calls.length === 1
      ? new Response("Accepted bill update", { status: 202 })
      : new Response(
          JSON.stringify({ objectCreated: { _id: "test-receipt" } }),
          { status: 201 },
        );
  };
  try {
    await nessieApi.stopBill("spotify-id");
    const r = await nessieApi.transfer(
      "checking-id",
      "savings-id",
      50,
      "OTTO test",
    );
    assert.equal(calls[0].url.pathname, "/bills/spotify-id");
    assert.equal(calls[0].init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      status: "cancelled",
    });
    assert.equal(calls[1].url.pathname, "/accounts/checking-id/transfers");
    assert.equal(calls[1].init?.method, "POST");
    const body = JSON.parse(String(calls[1].init?.body));
    assert.equal(body.amount, 50);
    assert.equal(body.payee_id, "savings-id");
    assert.equal(body.medium, "balance");
    assert.equal(r.objectCreated?._id, "test-receipt");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.NESSIE_KEY;
    else process.env.NESSIE_KEY = originalKey;
  }
});
