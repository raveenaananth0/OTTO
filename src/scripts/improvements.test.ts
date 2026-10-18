import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spendingCategory,
  spendingInsights,
} from "../helpers/spendingInsights";
import { validateSubscription } from "../helpers/manualSubscriptions";
import { runSimulation } from "../helpers/runSimulation";
import { fakeMonth } from "../helpers/fakeMonth";
test("merchant categorization recognizes coffee and delivery without manual logging", () => {
  assert.equal(spendingCategory("STARBUCKS #123"), "Coffee");
  assert.equal(spendingCategory("DUNKIN 42"), "Coffee");
  assert.equal(spendingCategory("UBER * EATS"), "Delivery");
  assert.equal(spendingCategory("DOORDASH COFFEE SHOP"), "Delivery");
  assert.equal(spendingCategory("Unrecognized merchant"), "Other");
});
test("categorization counts each purchase once and excludes transfers and deposits", () => {
  const categories = spendingInsights(fakeMonth);
  assert.equal(
    categories.reduce((s, c) => s + c.count, 0),
    fakeMonth.txns.filter((t) => t.type === "purchase").length,
  );
  assert.equal(
    Math.round(categories.reduce((s, c) => s + c.amount, 0) * 100),
    Math.round(
      fakeMonth.txns
        .filter((t) => t.type === "purchase")
        .reduce((s, t) => s + t.amount, 0) * 100,
    ),
  );
});
test("payday skips the savings round trip while preserving the month’s money", () => {
  const before = structuredClone(fakeMonth),
    result = runSimulation(fakeMonth, 4);
  assert.ok(
    !result.decisions.some(
      (d) => d.action === "rebalance" && [15, 29].includes(d.day),
    ),
  );
  assert.ok(result.dailyBalances.every((b) => b.checking >= 0));
  const last = result.dailyBalances.at(-1)!;
  const externalNet =
    fakeMonth.txns
      .filter((t) => t.type !== "transfer")
      .reduce((s, t) => s + (t.type === "deposit" ? t.amount : -t.amount), 0) -
    fakeMonth.bills.reduce((s, b) => s + b.amount, 0);
  assert.equal(
    Math.round((last.checking + last.savings) * 100),
    Math.round((fakeMonth.checking + fakeMonth.savings + externalNet) * 100),
  );
  assert.deepEqual(fakeMonth, before);
});
test("manual subscriptions preserve cents and reject invalid payments or days", () => {
  assert.deepEqual(
    validateSubscription({
      id: "custom",
      payee: " Gym ",
      amount: 24.99,
      dueDay: 12,
    }),
    { id: "custom", payee: "Gym", amount: 24.99, dueDay: 12 },
  );
  for (const changes of [
    { amount: 0 },
    { amount: NaN },
    { dueDay: 31 },
    { payee: "" },
  ])
    assert.throws(() =>
      validateSubscription({
        id: "c",
        payee: "Gym",
        amount: 20,
        dueDay: 1,
        ...changes,
      }),
    );
});
