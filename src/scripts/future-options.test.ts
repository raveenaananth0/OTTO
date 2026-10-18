import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  projectFuture,
  defaultHabits,
  habitsFromItems,
  habitTotals,
  type Habit,
} from "../helpers/projectFuture";
import { FutureChart } from "../components/FutureChart";
import { ottoSchemas } from "../helpers/ottoSchemas";
import { sanitizeWorkspace } from "../helpers/sanitizeWorkspace";
import { changeWorkspace } from "../helpers/changeWorkspace";
import type { SimState } from "../helpers/simTypes";
const state: SimState = {
  checking: 1000,
  savings: 1000,
  bills: [],
  txns: [
    { day: 15, type: "deposit", amount: 1000, desc: "Paycheck" },
    { day: 29, type: "deposit", amount: 1000, desc: "Paycheck" },
  ],
};
const base = defaultHabits(state);
for (const year of [2027, 2030, 2040, 2076])
  test(`typed end year ${year} controls every point and graph endpoint`, () => {
    const p = projectFuture(state, { ...base, targetYear: year });
    assert.equal(p.end.year, year);
    assert.equal(p.end.month, (year - 2026) * 12);
    assert.equal(p.points.length, (year - 2026) * 12 + 1);
    assert(Math.abs(p.end.savings - 1000 * 1.03 ** (year - 2026)) < 0.011);
    const svg = renderToStaticMarkup(
      createElement(FutureChart, {
        timelines: [
          {
            id: "baseline",
            name: "Current habits",
            color: "#aaa",
            projection: p,
          },
        ],
        selected: "baseline",
        onSelect: () => {},
      }),
    );
    assert(svg.includes(`to ${year}.`));
    assert(svg.includes(`in ${year}`));
    assert(svg.includes(`>${year}</text>`));
    assert(!/NaN|Infinity/.test(svg));
    const coords = svg.match(/points="([^"]+)"/)![1].split(" ");
    assert.equal(coords.length, p.points.length);
    assert.equal(Number(coords.at(-1)!.split(",")[0]), 688);
  });
test("empty, past, fractional, infinite and out-of-range years are rejected", () => {
  for (const year of [0, 2026, 2025, 2077, 2030.5, NaN, Infinity])
    assert.throws(() => projectFuture(state, base, year), /whole year/);
  assert.equal(projectFuture(state, base).end.year, 2036);
});
for (const [frequency, amount, expected] of [
  ["day", 5, (5 * 365) / 12],
  ["week", 10, (10 * 52) / 12],
  ["month", 100, 100],
  ["year", 1200, 100],
  ["payday", 50, 100],
] as const)
  test(`${frequency} habits use the correct monthly equivalent`, () => {
    const h = habitsFromItems(
      [{ id: "custom", label: "Habit", kind: "expense", frequency, amount }],
      2,
      "Goal",
      2040,
    );
    assert(Math.abs(habitTotals(h, 2).expense - expected) < 1e-8);
    assert.equal(h.targetYear, 2040);
    assert.equal(ottoSchemas.habits.parse(h).items![0].frequency, frequency);
    assert(Math.abs(projectFuture(state, h).spending - expected) < 0.006);
  });
test("equivalent daily and yearly costs produce the same full timeline", () => {
  const make = (frequency: Habit["frequency"], amount: number) =>
    habitsFromItems(
      [{ id: "e", label: "Expense", kind: "expense", frequency, amount }],
      1,
      "",
      2030,
    );
  assert.deepEqual(
    projectFuture(state, make("day", 5)).points,
    projectFuture(state, make("year", 1825)).points,
  );
});
test("frequencies affect expense, saving and investing totals; unsupported frequencies fail", () => {
  const items: Habit[] = [
    {
      id: "e",
      label: "Club",
      kind: "expense",
      frequency: "year",
      amount: 1200,
    },
    { id: "s", label: "Save", kind: "saving", frequency: "week", amount: 20 },
    {
      id: "i",
      label: "Invest",
      kind: "investment",
      frequency: "day",
      amount: 5,
    },
  ];
  const h = habitsFromItems(items, 2);
  const totals = habitTotals(h, 2);
  assert.equal(totals.expense, 100);
  assert(Math.abs(totals.saving - (20 * 52) / 12) < 1e-8);
  assert(Math.abs(totals.investment - (5 * 365) / 12) < 1e-8);
  assert.equal(
    ottoSchemas.habits.safeParse({
      ...h,
      items: [{ ...items[0], frequency: "hour" }],
    }).success,
    false,
  );
});
test("saved timeline, commit and reloaded workspace retain year and frequencies", () => {
  const h = habitsFromItems(
    [
      {
        id: "e",
        label: "Annual fee",
        kind: "expense",
        frequency: "year",
        amount: 120,
      },
    ],
    1,
    "",
    2045,
  );
  let workspace = changeWorkspace(
    { forks: [], subscriptionRequests: {} },
    { action: "fork", name: "2045 plan", habits: h, source: "demo" },
    "123",
    "now",
  );
  workspace = changeWorkspace(
    workspace,
    { action: "commit", id: "123" },
    "",
    "now",
  );
  const reloaded = sanitizeWorkspace(JSON.parse(JSON.stringify(workspace)));
  assert.equal(reloaded.plan!.habits.targetYear, 2045);
  assert.equal(reloaded.forks[0].habits.items![0].frequency, "year");
  assert.equal(projectFuture(state, reloaded.plan!.habits).end.year, 2045);
  assert.equal(
    projectFuture(state, base, 2045).points.length,
    projectFuture(state, h, 2045).points.length,
  );
});
