import { test } from "node:test";
import assert from "node:assert/strict";
import { loadNessie } from "./nessie";
const responses: any[][] = [
  [
    { _id: "other", first_name: "Someone", last_name: "Else" },
    { _id: "demo", first_name: "Money", last_name: "Autopilot Demo" },
  ],
  [
    { _id: "checking", nickname: "Money Autopilot Checking", balance: 1456 },
    { _id: "savings", nickname: "Autopilot Savings", balance: 1800 },
  ],
  [
    {
      _id: "bill",
      payee: "Spotify",
      payment_amount: 12,
      recurring_date: 20,
      status: "recurring",
    },
    {
      _id: "old",
      payee: "Old",
      payment_amount: 50,
      recurring_date: 2,
      status: "cancelled",
    },
  ],
  [],
  [],
];
test("loads only the seeded customer, active bills and live balances; missing history stays empty", async () => {
  const paths: string[] = [];
  const state = await loadNessie("test-secret", (async (input: URL) => {
    const url = new URL(input);
    paths.push(url.pathname);
    assert.equal(url.searchParams.get("key"), "test-secret");
    return Response.json(responses[paths.length - 1]);
  }) as typeof fetch);
  assert.deepEqual(paths, [
    "/customers",
    "/customers/demo/accounts",
    "/accounts/checking/bills",
    "/accounts/checking/purchases",
    "/accounts/checking/deposits",
  ]);
  assert.equal(state.checking, 1456);
  assert.equal(state.savings, 1800);
  assert.deepEqual(state.bills, [
    { id: "bill", payee: "Spotify", amount: 12, dueDay: 20 },
  ]);
  assert.equal(state.txns.length, 0);
  assert.ok(!JSON.stringify(state).includes("test-secret"));
});
test("network failures never expose the credential-bearing URL", async () => {
  await assert.rejects(
    loadNessie("test-secret", (async () => {
      throw Error("https://upstream?key=test-secret");
    }) as typeof fetch),
    (e) => e instanceof Error && !e.message.includes("test-secret"),
  );
});
test("missing key does not call upstream", async () => {
  await assert.rejects(
    loadNessie("", (async () => {
      assert.fail("must not fetch");
    }) as typeof fetch),
    /not configured/,
  );
});
test("sandbox purchases replace sample purchases and use the latest available month", async () => {
  const payloads = structuredClone(responses);
  payloads[3] = [
    {
      purchase_date: "2026-10-02",
      amount: 4.75,
      description: "Starbucks",
      status: "completed",
    },
    {
      purchase_date: "2026-09-02",
      amount: 90,
      description: "Earlier month",
      status: "completed",
    },
    {
      purchase_date: "2026-10-03",
      amount: 100,
      description: "Cancelled",
      status: "cancelled",
    },
  ] as any;
  let i = 0;
  const state = await loadNessie("test", (async () =>
    Response.json(payloads[i++])) as typeof fetch);
  assert.equal(state.purchaseSource, "nessie");
  assert.deepEqual(
    state.txns.filter((t) => t.type === "purchase"),
    [{ day: 2, type: "purchase", amount: 4.75, desc: "Starbucks" }],
  );
  assert.equal(state.txns.filter((t) => t.type === "deposit").length, 0);
});
test("missing seeded customer and invalid upstream JSON fail explicitly", async () => {
  await assert.rejects(
    loadNessie("test", (async () => Response.json([])) as typeof fetch),
    /not found/,
  );
  await assert.rejects(
    loadNessie("test", (async () =>
      Response.json({ code: 401 })) as typeof fetch),
    /invalid response/,
  );
});
test("invalid bills are quarantined while healthy balances remain", async () => {
  const payloads = structuredClone(responses);
  payloads[2][0].recurring_date = 0;
  let i = 0;
  const state = await loadNessie("test", (async () =>
    Response.json(payloads[i++])) as typeof fetch);
  assert.equal(state.checking, 1456);
  assert.equal(state.bills.length, 0);
  assert(state.warnings.some((w) => w.includes("invalid bill")));
});
test("day 31 is explicitly compressed, invalid calendar dates excluded, optional failures retain balances", async () => {
  const payloads = structuredClone(responses);
  payloads[2][0].recurring_date = 31;
  payloads[3] = [
    { purchase_date: "2026-10-00", status: "completed", amount: 10 },
    { purchase_date: "2099-01-03", status: "completed", amount: 20 },
    {
      purchase_date: "2026-10-02",
      status: "completed",
      amount: 4.75,
      description: "Coffee",
    },
  ] as any;
  let i = 0;
  const state = await loadNessie("test", (async () =>
    Response.json(payloads[i++])) as typeof fetch);
  assert.equal(state.bills[0].dueDay, 30);
  assert.equal(state.txns.length, 1);
  assert(state.warnings.some((w) => w.includes("Day 31")));
  let j = 0;
  const partial = await loadNessie("test", (async () => {
    const n = j++;
    return n === 3
      ? new Response("", { status: 503 })
      : Response.json(payloads[n]);
  }) as typeof fetch);
  assert.equal(partial.checking, 1456);
  assert.equal(partial.bills.length, 1);
  assert(
    partial.warnings.some((w) => w.includes("Purchase history unavailable")),
  );
});
