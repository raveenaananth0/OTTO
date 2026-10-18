import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeMonth } from "../helpers/fakeMonth";
import {
  defaultHabits,
  habitItems,
  habitsFromItems,
  habitTotals,
  projectFuture,
} from "../helpers/projectFuture";
import { ottoSchemas } from "../helpers/ottoSchemas";
import { changeWorkspace } from "../helpers/changeWorkspace";
import { demoFutureReply } from "../helpers/demoFutureReply";
import {
  decideApproval,
  paymentApprovals,
  approvalTotal,
  type PaymentApproval,
} from "../helpers/paymentApprovals";
const base = defaultHabits(fakeMonth),
  items = habitItems(base);
test("editable defaults preserve the exact baseline spending", () => {
  const custom = habitsFromItems(items, 2);
  assert.equal(
    projectFuture(fakeMonth, custom).spending,
    projectFuture(fakeMonth, base).spending,
  );
});
test("renaming a habit changes its label without changing its financial effect", () => {
  const changed = habitsFromItems(
    items.map((h) =>
      h.id === "coffee" ? { ...h, label: "Coffee at home" } : h,
    ),
    2,
  );
  assert.equal(
    projectFuture(fakeMonth, changed).end.netWorth,
    projectFuture(fakeMonth, base).end.netWorth,
  );
  assert.equal(
    habitItems(changed).find((h) => h.id === "coffee")?.label,
    "Coffee at home",
  );
});
test("custom spending is counted exactly once and removal sets that budget to zero", () => {
  const added = habitsFromItems(
    [
      ...items,
      {
        id: "gym",
        label: "Gym",
        kind: "expense",
        frequency: "month",
        amount: 23.75,
      },
    ],
    2,
  );
  assert.equal(
    projectFuture(fakeMonth, added).spending,
    projectFuture(fakeMonth, base).spending + 23.75,
  );
  const removed = habitsFromItems(
    items.filter((h) => h.id !== "coffee"),
    2,
  );
  assert.equal(
    projectFuture(fakeMonth, removed).spending,
    projectFuture(fakeMonth, base).spending - 55,
  );
});
test("payday frequency and savings classifications do not create income or expenses", () => {
  const habits = habitsFromItems(
    [
      {
        id: "save",
        label: "Travel savings",
        kind: "saving",
        frequency: "payday",
        amount: 40,
      },
    ],
    2,
  );
  assert.equal(habitTotals(habits, 2).saving, 80);
  assert.equal(
    projectFuture(fakeMonth, habits).income,
    projectFuture(fakeMonth, base).income,
  );
  assert.equal(habitTotals(habits, 2).expense, 0);
});
test("invalid amounts and duplicate habit identities are rejected", () => {
  assert.equal(
    ottoSchemas.habits.safeParse({
      ...base,
      items: [{ ...items[0], amount: -1 }],
    }).success,
    false,
  );
  assert.equal(
    ottoSchemas.habits.safeParse({ ...base, items: [items[0], items[0]] })
      .success,
    false,
  );
});
test("editing at the three-fork limit changes a fork rather than adding one", () => {
  let w = {
    forks: [0, 1, 2].map((i) => ({
      id: String(i),
      name: "Plan " + i,
      habits: base,
      source: "demo" as const,
      createdAt: "now",
    })),
    subscriptionRequests: {},
  };
  const edited = changeWorkspace(
    w,
    {
      action: "edit",
      id: "1",
      name: "My habits",
      habits: habitsFromItems(items.slice(1), 2),
    },
    "unused",
    "now",
  );
  assert.equal(edited.forks.length, 3);
  assert.equal(edited.forks[1].name, "My habits");
  assert.equal(w.forks[1].name, "Plan 1");
});
test("demo replies come from the selected timeline, without a model call", () => {
  const habits = habitsFromItems(
      items.filter((h) => h.id !== "coffee"),
      2,
    ),
    projection = projectFuture(fakeMonth, habits),
    expected = projection.end.netWorth.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  assert.ok(
    demoFutureReply(fakeMonth, habits, "What did our habits mean?").includes(
      expected,
    ),
  );
  assert.match(demoFutureReply(fakeMonth, habits, "hi"), /modeled 2036/);
});
const request: PaymentApproval = {
  id: "request-1",
  token: "correct",
  email: "demo@example.com",
  charges: [
    { id: "1", payee: "Savings", amount: 23.75, kind: "savings" },
    { id: "2", payee: "Phone", amount: 70, kind: "bill" },
  ],
  createdAt: 1000,
  expiresAt: 2000,
  status: "pending",
};
test("email totals retain cents and reading a request never approves it", () => {
  assert.equal(approvalTotal(request), 93.75);
  assert.equal(request.status, "pending");
});
test("an explicit valid approval creates one deterministic demo receipt", () => {
  const result = decideApproval(request, "correct", "approve", 1500);
  assert.equal(result.status, "simulated");
  assert.equal(result.receiptId, "demo-request-1");
  assert.equal(result.approvedAt, 1500);
  assert.equal(request.status, "pending");
  assert.deepEqual(decideApproval(result, "correct", "approve", 1600), result);
});
test("wrong tokens, expired links, and declines cannot authorize payments", () => {
  assert.throws(
    () => decideApproval(request, "wrong", "approve", 1500),
    /invalid/,
  );
  assert.throws(
    () => decideApproval(request, "correct", "approve", 2000),
    /expired/,
  );
  const declined = decideApproval(request, "correct", "decline", 1500);
  assert.equal(declined.status, "declined");
  assert.equal(declined.receiptId, undefined);
  assert.throws(
    () => decideApproval(declined, "correct", "approve", 1600),
    /no longer pending/,
  );
});
test("stored payment summaries are immutable snapshots of their charge list", () => {
  const charges = [
      { id: "test", payee: "Demo service", amount: 40, kind: "bill" as const },
    ],
    created = paymentApprovals.create("demo@example.com", charges);
  charges[0].amount = 900;
  const saved = paymentApprovals.get(created.id)!;
  assert.equal(saved.charges[0].amount, 40);
  saved.charges[0].amount = 500;
  assert.equal(paymentApprovals.get(created.id)!.charges[0].amount, 40);
});
