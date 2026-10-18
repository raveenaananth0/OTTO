import { test } from "node:test";
import assert from "node:assert/strict";
import {
  growAnalysis,
  defaultGrowSettings as defaults,
  projection,
  cents,
  parseDate,
} from "../helpers/grow";
import { fakeMonth } from "../helpers/fakeMonth";
import type { SimState } from "../helpers/simTypes";
import { readGrowSettings, saveGrowSettings } from "../helpers/growStore";
test("Grow reserves payday bills and future spending, never an unreceived paycheck", () => {
  const s: SimState = {
    checking: 1000,
    savings: 0,
    bills: [{ id: "rent", payee: "Rent", amount: 300, dueDay: 29 }],
    txns: [
      { day: 1, type: "purchase", amount: 170, desc: "Groceries" },
      { day: 29, type: "deposit", amount: 10000, desc: "Paycheck" },
    ],
  };
  const a = growAnalysis(
    s,
    "nessie",
    { ...defaults, nextPayday: "2026-10-29" },
    "2026-10-17",
  );
  assert.equal(a.billReserve, 300);
  assert.equal(a.everydayReserve, 130);
  assert.equal(a.reserve, 630);
  assert.equal(a.idle, 370);
  assert.equal(a.emergencyGoal, 1800);
});
test("Grow rolls bills across months and clamps short-month due dates", () => {
  const s: SimState = {
    checking: 2000,
    savings: 1500,
    bills: [{ id: "bill", payee: "Internet", amount: 50, dueDay: 30 }],
    txns: [],
  };
  const a = growAnalysis(
    s,
    "nessie",
    { ...defaults, nextPayday: "2027-03-01" },
    "2027-02-20",
  );
  assert.equal(a.due[0].date, "2027-02-28");
  assert.equal(a.billReserve, 50);
  assert.equal(a.historyThin, true);
  assert.equal(
    growAnalysis(s, "nessie", defaults, "2026-12-20").due[0].date,
    "2026-12-30",
  );
});
test("Grow sample excludes suspicious transfers, and custom next-month payday keeps all sample spending", () => {
  const a = growAnalysis(fakeMonth, "demo", defaults);
  assert.equal(a.idle, 0);
  assert.equal(a.transferReserve, 0);
  const b = growAnalysis(fakeMonth, "demo", {
    ...defaults,
    nextPayday: "2026-11-05",
  });
  assert.equal(
    b.everydayReserve,
    fakeMonth.txns
      .filter((t) => t.type === "purchase")
      .reduce((s, t) => s + cents(t.amount), 0) / 100,
  );
});
test("Grow handles zero costs, negative checking, missing payroll and invalid settings", () => {
  const s = { checking: -50, savings: 0, bills: [], txns: [] };
  const a = growAnalysis(s, "nessie", defaults, "2026-10-17");
  assert.equal(a.idle, 0);
  assert.equal(a.confirmedPayday, false);
  assert.equal(a.emergencyReady, false);
  assert.equal(a.through, "2026-11-16");
  assert.throws(() => parseDate("2026-02-30"));
  for (const settings of [
    { ...defaults, buffer: -1 },
    { ...defaults, emergencyMonths: 1.5 },
    { ...defaults, nextPayday: "2026-10-16" },
    { ...defaults, nextPayday: "2027-01-01" },
  ])
    assert.throws(() => growAnalysis(s, "nessie", settings, "2026-10-17"));
});
test("Grow projections distinguish contributed principal, effective APY and negative returns", () => {
  assert.deepEqual(projection(412, 0, 12, 4, 1), {
    total: 428.48,
    contributed: 412,
    earnings: 16.48,
  });
  assert.equal(projection(0, 100, 12, 0, 10).total, 12000);
  assert.equal(projection(0, 100, 24, 0, 10).total, 24000);
  assert.ok(projection(0, 100, 12, -5, 10).total < 12000);
  assert.equal(projection(0, 0, 12, 5, 10).total, 0);
  assert.throws(() => projection(0, 100, 0, 4, 1));
  assert.throws(() => projection(0, 100, 12, -100, 1));
});
let seed = 47291;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 20; i++)
  test(`Grow randomized cash check ${i + 1}: reserves conserve cents without mutating input`, () => {
    const s: SimState = {
      checking: Math.round(random() * 500000) / 100,
      savings: Math.round(random() * 900000) / 100,
      bills: Array.from({ length: Math.floor(random() * 10) }, (_, j) => ({
        id: String(j),
        payee: "Bill " + j,
        amount: Math.round(random() * 150000) / 100,
        dueDay: 1 + Math.floor(random() * 30),
      })),
      txns: Array.from({ length: 20 }, (_, j) => ({
        day: 1 + Math.floor(random() * 17),
        type: j % 5 ? "purchase" : "deposit",
        amount: Math.round(random() * 20000) / 100,
        desc: j % 5 ? "Purchase" : "Payroll",
      })),
    };
    const before = JSON.stringify(s),
      a = growAnalysis(s, "nessie", defaults, "2026-10-17");
    assert.equal(JSON.stringify(s), before);
    assert.ok(a.idle >= 0);
    assert.equal(
      cents(a.idle),
      Math.max(0, cents(s.checking) - cents(a.reserve)),
    );
    assert.equal(
      cents(a.reserve),
      cents(a.billReserve) + cents(a.everydayReserve) + 20000,
    );
    if (a.idle > 0)
      assert.ok(cents(s.checking) - cents(a.idle) >= cents(a.reserve));
  });
test("Grow settings survive corrupt or unavailable browser storage", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => '{"apy":-5,"buffer":"bad","contribution":1000000}',
        setItem: () => {
          throw Error();
        },
      },
    });
    assert.equal(readGrowSettings().apy, 4);
    assert.equal(readGrowSettings().buffer, 200);
    assert.equal(readGrowSettings().contribution, 100);
    assert.equal(saveGrowSettings(defaults), false);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw Error();
        },
      },
    });
    assert.deepEqual(readGrowSettings(), defaults);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as any).localStorage;
  }
});

test("Paid recurring bills remain reserved for the next month without becoming everyday spending twice", () => {
  const state = {
    checking: 2000,
    savings: 1000,
    bills: [],
    txns: [{ day: 3, type: "purchase" as const, amount: 850, desc: "Rent" }],
    activeBills: [{ id: "rent", payee: "Rent", amount: 850, dueDay: 3 }],
  };
  const a = growAnalysis(state, "nessie", defaults, "2026-10-17");
  assert.equal(a.billReserve, 850);
  assert.equal(a.everydayReserve, 0);
  assert.equal(a.monthlyCosts, 850);
});
test("Overdue one-time bills are due now and never repeat monthly; manual additions are retained", () => {
  const state = {
    checking: 2000,
    savings: 1000,
    bills: [
      { id: "manual:coffee", payee: "Coffee club", amount: 20, dueDay: 20 },
    ],
    txns: [],
    activeBills: [{ id: "one", payee: "One-off", amount: 100, dueDay: 3 }],
    oneTimeBillDates: { one: "2026-10-03" },
  };
  const a = growAnalysis(state, "nessie", defaults, "2026-10-17");
  assert.equal(a.billReserve, 120);
  assert.equal(a.due.find((b) => b.id === "one")?.date, "2026-10-17");
  assert.equal(a.due.filter((b) => b.id === "one").length, 1);
});

test("Native and manual bill names in different languages retain separate reserves", () => {
  const state = {
    checking: 2000,
    savings: 0,
    bills: [{ id: "manual:x", payee: "電気", amount: 300, dueDay: 21 }],
    txns: [],
    activeBills: [{ id: "native", payee: "電話", amount: 1000, dueDay: 20 }],
  };
  assert.equal(
    growAnalysis(state, "nessie", defaults, "2026-10-17").billReserve,
    1300,
  );
});

test("Grow reserves legitimate transfers while excluding every transfer the agent would hold", () => {
  const state: SimState = {
    ...fakeMonth,
    checking: 10000,
    txns: [
      ...fakeMonth.txns,
      {
        day: 2,
        type: "transfer",
        amount: 40,
        desc: "Small payment",
        payeeId: "known",
      },
      {
        day: 3,
        type: "transfer",
        amount: 500,
        desc: "Threshold payment",
        payeeId: "known",
      },
      {
        day: 4,
        type: "transfer",
        amount: 500.01,
        desc: "Unverified large payment",
        payeeId: "known",
      },
    ],
  };
  const before = JSON.stringify(state);
  const a = growAnalysis(state, "demo", defaults);
  assert.equal(a.transferReserve, 540);
  assert.equal(
    cents(a.idle),
    cents(state.checking) -
      cents(a.billReserve) -
      cents(a.everydayReserve) -
      54000 -
      cents(defaults.buffer),
  );
  assert.equal(JSON.stringify(state), before);
});

test("Grow payday and buffer settings stay separate for each data mode, preserving legacy bank settings", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const map = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => map.set(k, v),
      },
    });
    saveGrowSettings({ ...defaults, nextPayday: "2026-10-29", buffer: 350 });
    assert.equal(readGrowSettings("nessie").nextPayday, "2026-10-29");
    assert.equal(readGrowSettings("demo").nextPayday, "");
    assert.equal(
      growAnalysis(fakeMonth, "demo", readGrowSettings("demo")).through,
      "2026-10-15",
    );
    saveGrowSettings(
      { ...defaults, nextPayday: "2026-10-20", buffer: 100 },
      "demo",
    );
    assert.equal(readGrowSettings("nessie").buffer, 350);
    assert.equal(readGrowSettings("demo").buffer, 100);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as any).localStorage;
  }
});
