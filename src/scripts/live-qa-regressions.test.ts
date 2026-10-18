import { test } from "node:test";
import assert from "node:assert/strict";
import { demoOttoReply } from "../helpers/demoOttoReply";
import { runSimulation } from "../helpers/runSimulation";
import { fakeMonth } from "../helpers/fakeMonth";
import {
  balanceAxis,
  simulationEvents,
} from "../helpers/simulationPresentation";
import type { SimState } from "../helpers/simTypes";
const bank = { ...fakeMonth, checking: 1399, savings: 1501, txns: [] };
const settings = { nextPayday: "2026-10-29", buffer: 200, emergencyMonths: 3 };
const answer = (q: string) =>
  demoOttoReply(bank, 4, 0, q, "nessie", "2026-10-18", settings);
for (const [price, left, yes] of [
  ["$60", 1062, true],
  ["60 dollars", 1062, true],
  ["2000 dollar", -878, false],
  ["$1,500", -378, false],
  ["$0.99", 1121.01, true],
  ["$60 and $40", 1022, true],
  ["$1,122", 0, true],
  ["$1,122.01", -0.01, false],
] as const) {
  test(`bank affordability independent oracle ${price}`, () => {
    const r = answer(`Can I afford ${price}?`);
    assert(r.startsWith(yes ? "Yes." : "No."));
    assert(
      r.includes(
        left.toLocaleString("en-US", { style: "currency", currency: "USD" }) +
          " left",
      ),
      r,
    );
  });
}
test("before-payday bills and saved payday agree with affordability", () => {
  const r = answer("What bills are due before payday?");
  assert.match(r, /\$77\.00/);
  assert.match(r, /Spotify/);
  assert.match(r, /Internet/);
  assert(!r.includes("Rent"));
  assert.match(answer("When is my next payday?"), /2026-10-29/);
  assert.match(
    answer("What is my Pepco bill?"),
    /Pepco is \$135\.00, scheduled for day 9/,
  );
  assert.match(answer("Can I afford lunch?"), /Include the purchase amount/);
  assert.match(answer("Why am I always broke?"), /do not show a shortfall/);
});
test("copilot only observes, including an overdraft and an unblocked scam", () => {
  const base = runSimulation(fakeMonth, 0),
    copilot = runSimulation(fakeMonth, 1),
    assisted = runSimulation(fakeMonth, 2);
  assert.deepEqual(copilot.dailyBalances, base.dailyBalances);
  assert.deepEqual(copilot.score, base.score);
  assert.equal(copilot.decisions.length, 0);
  assert(
    copilot.alerts!.some((a) => /projected to go negative/.test(a.detail)),
  );
  assert(copilot.alerts!.some((a) => /Hold \$900/.test(a.detail)));
  assert(assisted.decisions.length > 0);
  assert(assisted.decisions.every((d) => d.needsApproval));
  assert.match(
    simulationEvents(fakeMonth, base, 14, 0).join(" "),
    /Sent \$900\.00.*No agent to stop it/,
  );
  assert.match(
    simulationEvents(fakeMonth, copilot, 14, 1).join(" "),
    /no transfer was blocked/,
  );
});
test("large sweeps ask at level 3; smaller moves can run automatically", () => {
  const r = runSimulation(fakeMonth, 3);
  const sweep = r.decisions.find(
    (d) => d.action === "sweep_savings" && d.amount! > 500,
  )!;
  assert(sweep);
  assert(sweep.needsApproval);
  assert.match(sweep.detail, /1,127\.70/);
  assert(
    r.decisions.some(
      (d) =>
        d.amount! <= 500 && d.action !== "hold_transfer" && !d.needsApproval,
    ),
  );
  for (const d of r.decisions)
    assert.equal(
      d.needsApproval,
      d.action === "hold_transfer" || d.amount! > 500,
    );
});
test("bank bills show in the log at every level, even when no intervention is needed", () => {
  for (const level of [0, 1, 2, 3, 4] as const) {
    const r = runSimulation(bank, level);
    assert.equal(r.dailyBalances[29].checking, 97);
    assert.match(
      simulationEvents(bank, r, 3, level).join(" "),
      /Rent \$850\.00 paid/,
    );
    assert.equal(r.decisions.length, 0);
  }
});
test("moved bill is logged once on its new date and budgeted after its original date", () => {
  const s: SimState = {
    checking: 100,
    savings: 0,
    bills: [{ id: "r", payee: "Rent", amount: 150, dueDay: 3 }],
    txns: [
      { day: 15, type: "deposit", amount: 1000, desc: "Paycheck" },
      { day: 29, type: "deposit", amount: 1000, desc: "Paycheck" },
    ],
  };
  const r = runSimulation(s, 4);
  assert.equal(simulationEvents(s, r, 3, 4).length, 0);
  assert.match(simulationEvents(s, r, 17, 4).join(" "), /Rent \$150\.00 paid/);
  const response = demoOttoReply(s, 4, 16, "What bills are due before payday?");
  assert.match(response, /Rent \$150\.00/);
});
test("chart ticks are round, ordered, cover the data and include a single zero", () => {
  for (const values of [
    [-1078, 1400, 727],
    [97, 1399],
    [0],
    [400000, -300000],
  ]) {
    const a = balanceAxis(values);
    assert(a.min <= Math.min(...values));
    assert(a.max >= Math.max(...values));
    assert.equal(a.ticks.filter((t) => t === 0).length, 1);
    assert(a.ticks.length <= 8);
    for (let i = 1; i < a.ticks.length; i++)
      assert(a.ticks[i] > a.ticks[i - 1]);
  }
  assert.deepEqual(
    balanceAxis([-1078, 1400]).ticks,
    [-1500, -1000, -500, 0, 500, 1000, 1500],
  );
});

test("affordability paraphrases and simulated emergency-fund progress use current numbers", () => {
  for (const q of [
    "Is a $60 ticket affordable?",
    "Do I have enough money for $60 shoes?",
    "Can I pay $60 for lunch?",
    "I want to spend $60",
  ]) {
    assert.match(answer(q), /^Yes\. After the \$60\.00 purchase/);
  }
  const r = demoOttoReply(fakeMonth, 3, 30, "Should I invest?");
  assert.match(r, /\$2,927\.00/);
  assert(!r.includes("$1,500.00"));
});
