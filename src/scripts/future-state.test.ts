import { test } from "node:test";
import assert from "node:assert/strict";
import { futureState } from "../helpers/futureState";
import {
  defaultHabits,
  projectFuture,
  spendingProfile,
} from "../helpers/projectFuture";
import { fakeMonth } from "../helpers/fakeMonth";
import type { SimState } from "../helpers/simTypes";

const bank: SimState = {
  checking: 1399,
  savings: 1501,
  bills: [{ id: "bank-rent", payee: "Rent", amount: 700, dueDay: 3 }],
  txns: [],
};
test("hybrid preserves bank balances and bills while supplying sample income and spending", () => {
  const state = futureState(bank, "nessie");
  assert.equal(state.checking, 1399);
  assert.equal(state.savings, 1501);
  assert.deepEqual(state.bills, bank.bills);
  assert.equal(spendingProfile(state).income, 2300);
  assert.equal(spendingProfile(state).paychecks, 2);
  assert.equal(spendingProfile(state).coffee, 55);
  assert.equal(
    state.txns.some((t) => t.type === "transfer"),
    false,
  );
  assert.equal(
    state.bills.some((b) => b.id === "phone"),
    false,
  );
});
test("hybrid replaces bank history rather than counting deposits or purchases twice", () => {
  const state = futureState(
    {
      ...bank,
      txns: [
        { day: 15, type: "deposit", amount: 10000, desc: "Paycheck" },
        { day: 2, type: "purchase", amount: 900, desc: "Coffee" },
      ],
    },
    "nessie",
  );
  assert.equal(spendingProfile(state).income, 2300);
  assert.equal(spendingProfile(state).coffee, 55);
});
test("projection inputs are isolated copies and never mutate bank or sample records", () => {
  const before = JSON.stringify(bank),
    sampleBefore = JSON.stringify(fakeMonth);
  const state = futureState(bank, "nessie");
  state.bills[0].amount = 0;
  state.txns[0].amount = 0;
  assert.equal(JSON.stringify(bank), before);
  assert.equal(JSON.stringify(fakeMonth), sampleBefore);
});
test("changing live bank balances and bills changes the hybrid forecast", () => {
  const original = futureState(bank, "nessie");
  const richer = futureState({ ...bank, checking: 2399 }, "nessie");
  assert.equal(
    projectFuture(richer, defaultHabits(richer)).end.netWorth -
      projectFuture(original, defaultHabits(original)).end.netWorth,
    1000,
  );
  const expensive = futureState(
    { ...bank, bills: [{ ...bank.bills[0], amount: 1000 }] },
    "nessie",
  );
  assert.ok(
    projectFuture(expensive, defaultHabits(expensive)).end.netWorth <
      projectFuture(original, defaultHabits(original)).end.netWorth,
  );
});
test("sample mode retains its own schedule", () => {
  assert.deepEqual(futureState(fakeMonth, "demo"), fakeMonth);
});
