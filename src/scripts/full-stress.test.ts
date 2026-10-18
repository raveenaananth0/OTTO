import { test } from "node:test";
import assert from "node:assert/strict";
import { runSimulation } from "../helpers/runSimulation";
import {
  projectFuture,
  defaultHabits,
  habitsFromItems,
} from "../helpers/projectFuture";
import { futureState } from "../helpers/futureState";
import {
  growAnalysis,
  defaultGrowSettings,
  projection,
  parseDate,
} from "../helpers/grow";
import { questionAmount, demoOttoReply } from "../helpers/demoOttoReply";
import { changeWorkspace } from "../helpers/changeWorkspace";
import { sanitizeWorkspace } from "../helpers/sanitizeWorkspace";
import {
  validateSubscription,
  upsertManualSubscription,
  manualSubscriptions,
} from "../helpers/manualSubscriptions";
import { paymentApprovals, decideApproval } from "../helpers/paymentApprovals";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FutureChart } from "../components/FutureChart";
import type { SimState } from "../helpers/simTypes";
const cents = (n: number) => Math.round(n * 100);
let seed = 20261018;
const rand = (min: number, max: number) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return min + (seed % (max - min + 1));
};
// Deterministic randomized data: empty history, no payroll, insolvency, clustered
// bills, repeated recipients, day-30 outflows and very large purchases.
for (let n = 0; n < 200; n++) {
  const state: SimState = {
    checking: rand(-20000, 600000) / 100,
    savings: rand(0, 1000000) / 100,
    bills: Array.from({ length: rand(0, 12) }, (_, i) => ({
      id: "b" + i,
      payee: "Bill " + i,
      amount: rand(0, 150000) / 100,
      dueDay: rand(1, 30),
    })),
    txns: Array.from({ length: rand(0, 60) }, (_, i) => ({
      day: rand(1, 30),
      type: (["deposit", "purchase", "transfer"] as const)[rand(0, 2)],
      amount: rand(0, 150000) / 100,
      desc: i % 3 === 0 ? "Salary" : i % 3 === 1 ? "Coffee" : "DoorDash",
      payeeId: "recipient" + rand(0, 4),
    })),
  };
  test(`random month ${String(n + 1).padStart(3, "0")}: cash conservation, all levels, independent forecasts`, () => {
    const frozen = structuredClone(state);
    for (const level of [0, 1, 2, 3, 4] as const) {
      const r = runSimulation(state, level);
      assert.deepEqual(runSimulation(state, level), r);
      assert.equal(r.dailyBalances.length, 30);
      if (level === 1) {
        assert.deepEqual(r.dailyBalances, runSimulation(state, 0).dailyBalances);
        assert.equal(r.decisions.length, 0);
      }
      // Independent terminal balance oracle: scheduling and internal transfers
      // cannot create cash; only blocked outgoing transfers change the total.
      const expected =
        cents(state.checking) +
        cents(state.savings) -
        state.bills.reduce((sum, b) => sum + cents(b.amount), 0) +
        state.txns.reduce(
          (sum, t) => sum + (t.type === "deposit" ? 1 : -1) * cents(t.amount),
          0,
        ) +
        r.decisions
          .filter((d) => d.action === "hold_transfer")
          .reduce((sum, d) => sum + cents(d.amount!), 0);
      assert.equal(
        cents(r.dailyBalances[29].checking) +
          cents(r.dailyBalances[29].savings),
        expected,
      );
      assert(
        r.dailyBalances.every(
          (b) => Number.isFinite(b.checking) && b.savings >= 0,
        ),
      );
      assert.equal(
        r.score.interventions,
        r.decisions.filter((d) => d.needsApproval).length,
      );
      assert.equal(
        r.score.scamsBlocked,
        r.decisions.filter((d) => d.action === "hold_transfer").length,
      );
    }
    const base = defaultHabits(state),
      p = projectFuture(state, base);
    assert.equal(p.points.length, 121);
    // Baseline has no contributions: checking follows growing monthly surplus,
    // savings compound at exactly 3% annually. Verify every plotted month.
    let checking = state.checking;
    for (let m = 0; m <= 120; m++) {
      if (m) checking += (p.income - p.spending) * 1.02 ** ((m - 1) / 12);
      const savings = state.savings * 1.03 ** (m / 12),
        point = p.points[m];
      assert(Math.abs(point.checking - checking) < 0.011, "checking oracle");
      assert(Math.abs(point.savings - savings) < 0.011, "savings oracle");
      assert(
        Math.abs(
          point.netWorth - point.checking - point.savings - point.investments,
        ) < 0.025,
      );
    }
    const cheaper = projectFuture(state, { ...base, coffee: 0, delivery: 0 });
    assert(cheaper.end.netWorth >= p.end.netWorth - 0.01);
    const h = habitsFromItems(
      [
        {
          id: "s",
          label: "Save",
          kind: "saving",
          frequency: "month",
          amount: 25,
        },
      ],
      2,
    );
    assert(
      projectFuture(state, h).points.every((point) =>
        Number.isFinite(point.netWorth),
      ),
    );
    const a = growAnalysis(state, "nessie", defaultGrowSettings, "2026-10-18");
    assert.equal(
      cents(a.reserve),
      cents(a.billReserve) +
        cents(a.everydayReserve) +
        cents(a.transferReserve) +
        20000,
    );
    assert.equal(
      cents(a.idle),
      Math.max(0, cents(state.checking) - cents(a.reserve)),
    );
    assert.deepEqual(futureState(state, "nessie").bills, state.bills);
    assert.deepEqual(state, frozen);
  });
}

test("monetary questions parse complete grouped amounts and reject malformed/zero/negative", () => {
  for (const [text, value] of [
    ["$1,000", 1000],
    ["$1,000.50", 1000.5],
    ["1,500 dollars", 1500],
    ["$60", 60],
    ["$60.", 60],
    ["$1,000.50, please", 1000.5],
  ] as const)
    assert.equal(questionAmount(text), value);
  for (const text of [
    "$1,00",
    "$60.999",
    "$-50",
    "$0",
    "$1,000,000,001",
    "$1k",
    "$1e3",
    "-$50",
  ])
    assert.throws(() => questionAmount(text));
  const s: SimState = { checking: 100, savings: 0, bills: [], txns: [] };
  assert.match(
    demoOttoReply(s, 4, 0, "Can I afford a $1,000 ticket?"),
    /^No\./,
  );
  assert.match(demoOttoReply(s, 4, 0, "Can I afford $60.999?"), /decimal/);
});
test("Nessie chat uses future calendar bills and estimated history, not a second charge for old purchases", () => {
  const s: SimState = {
    checking: 1000,
    savings: 0,
    bills: [{ id: "b", payee: "Rent", amount: 400, dueDay: 3 }],
    txns: [{ day: 2, type: "purchase", amount: 18, desc: "coffee" }],
  };
  const reply = demoOttoReply(
    s,
    4,
    0,
    "Can I afford a $600 ticket?",
    "nessie",
    "2026-10-18",
  );
  assert.match(reply, /^No\./);
  assert.match(reply, /-\$231\.00/); // next rent400 +31day daily estimate31 +buffer200
  assert.match(
    demoOttoReply(s, 4, 0, "Upcoming bills", "nessie", "2026-10-18"),
    /2026-11-03/,
  );
});
test("future projections reject poisoned state/habits instead of drawing NaN or infinite graphs", () => {
  const s: SimState = { checking: 1000, savings: 0, bills: [], txns: [] },
    h = defaultHabits(s);
  for (const v of [NaN, Infinity, -1, 1e9 + 1])
    assert.throws(() => projectFuture(s, { ...h, coffee: v }));
  for (const v of [NaN, Infinity])
    assert.throws(() => projectFuture({ ...s, checking: v }, h));
  assert.throws(() =>
    projectFuture(s, {
      ...h,
      items: [
        {
          id: "x",
          label: "x",
          kind: "invalid",
          frequency: "month",
          amount: 1,
        } as any,
      ],
    }),
  );
});
test("three plans per source survive sanitization; one source cannot silently block the other", () => {
  let w: any = { forks: [], subscriptionRequests: {} };
  const habits = { delivery: 0, coffee: 0, invest: 0, savePerPayday: 0 };
  for (const source of ["demo", "nessie"] as const)
    for (let i = 0; i < 3; i++)
      w = changeWorkspace(
        w,
        { action: "fork", source, name: "Plan", habits },
        source + i,
        "now",
      );
  assert.equal(w.forks.length, 6);
  assert.equal(sanitizeWorkspace(w).forks.length, 6);
  assert.throws(() =>
    changeWorkspace(
      w,
      { action: "fork", source: "nessie", name: "Fourth", habits },
      "x",
      "now",
    ),
  );
});
test("manual entries reject malformed money and normalized duplicates while allowing edits", () => {
  const storage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  };
  const bill = { id: "gym", payee: "Gym Club", amount: 20, dueDay: 12 };
  for (const change of [
    { payee: "   " },
    { amount: NaN },
    { amount: -1 },
    { amount: 0.001 },
    { amount: 1.111 },
    { amount: 10001 },
    { dueDay: 0 },
    { dueDay: 31 },
    { dueDay: 1.5 },
  ])
    assert.throws(() => validateSubscription({ ...bill, ...change }));
  upsertManualSubscription(bill);
  assert.throws(
    () =>
      upsertManualSubscription({ ...bill, id: "gym-2", payee: " GYM-CLUB " }),
    /already/,
  );
  upsertManualSubscription({ ...bill, amount: 25 });
  assert.equal(manualSubscriptions().length, 1);
  assert.equal(manualSubscriptions()[0].amount, 25);
});
test("approval validation, wrong token, expiry, decline and replay bind exact immutable charges", () => {
  const bill = { id: "bill", payee: "Rent", amount: 20, kind: "bill" as const };
  for (const email of ["", "nope", "x@", "x@y"])
    assert.throws(() => paymentApprovals.create(email, [bill]));
  for (const amount of [0, -1, NaN, Infinity, 10001, 1.111])
    assert.throws(() =>
      paymentApprovals.create("qa@example.test", [{ ...bill, amount }]),
    );
  const r = paymentApprovals.create("qa@example.test", [bill]);
  assert.throws(() => decideApproval(r, "wrong", "approve"));
  assert.throws(() => decideApproval(r, r.token, "approve", r.expiresAt));
  const done = decideApproval(r, r.token, "approve");
  assert.equal(
    decideApproval(done, r.token, "approve").receiptId,
    done.receiptId,
  );
  const declined = decideApproval(r, r.token, "decline");
  assert.throws(() => decideApproval(declined, r.token, "approve"));
  assert.equal(r.status, "pending");
});
test("graph SVG includes all 121 points with finite coordinates, including negative trajectories", () => {
  const state: SimState = {
    checking: -500,
    savings: 0,
    bills: [{ id: "r", payee: "Rent", amount: 100, dueDay: 1 }],
    txns: [],
  };
  const p = projectFuture(state, defaultHabits(state));
  const svg = renderToStaticMarkup(
    createElement(FutureChart, {
      timelines: [{ id: "base", name: "Base", color: "#000", projection: p }],
      selected: "base",
      onSelect: () => {},
    }),
  );
  assert(!/NaN|Infinity/.test(svg));
  const points = svg.match(/points="([^"]+)"/)![1].split(" ");
  assert.equal(points.length, 121);
  assert(
    points.every((pair) =>
      pair.split(",").every((n) => Number.isFinite(Number(n))),
    ),
  );
  assert.match(svg, /2036/);
});
test("investment projection matches zero-rate and effective annual yield identities", () => {
  assert.equal(
    projection(1000, 0, 12, 4, 10).total,
    Math.round(1000 * 1.04 ** 10 * 100) / 100,
  );
  assert.equal(projection(1000, 100, 12, 0, 10).total, 13000);
  for (const values of [
    [-1, 0, 12, 4, 10],
    [0, 0, 0, 4, 10],
    [0, 0, 12, -100, 10],
    [0, 0, 12, 4, 51],
    [0, NaN, 12, 4, 10],
  ])
    assert.throws(() =>
      projection(...(values as [number, number, number, number, number])),
    );
  for (const date of ["2026-02-30", "2026-13-01", "garbage"])
    assert.throws(() => parseDate(date));
});

test("large imported category totals remain valid forecasts rather than crashing the page", () => {
  const s: SimState = {
    checking: 1000,
    savings: 0,
    bills: [],
    txns: [{ day: 1, type: "purchase", amount: 15000, desc: "Coffee" }],
  };
  assert(Number.isFinite(projectFuture(s, defaultHabits(s)).end.netWorth));
});

test("Nessie historical payroll is never presented as a confirmed upcoming paycheck", () => {
  const state: SimState = {
    checking: 1000,
    savings: 0,
    bills: [],
    txns: [{ day: 15, type: "deposit", amount: 1150, desc: "Paycheck" }],
  };
  assert.match(
    demoOttoReply(state, 4, 0, "When is my next payday?", "nessie"),
    /Past deposits do not confirm/,
  );
});
