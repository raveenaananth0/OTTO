import { z } from "zod";
import { ottoSchemas } from "./ottoSchemas";
import { validateState } from "./payroll";
import { payroll, paydayDates } from "./payroll";
import { spendingInsights } from "./spendingInsights";
import type { SimState } from "./simTypes";
export type Habits = {
  delivery: number;
  coffee: number;
  invest: number;
  savePerPayday: number;
  items?: Habit[];
  statement?: string;
  targetYear?: number;
};
export type Habit = {
  id: string;
  label: string;
  kind: "expense" | "saving" | "investment";
  frequency: "day" | "week" | "month" | "year" | "payday";
  amount: number;
};

export function habitItems(habits: Habits): Habit[] {
  return (
    habits.items?.map((item) => ({ ...item })) ?? [
      {
        id: "delivery",
        label: "Delivery",
        kind: "expense",
        frequency: "month",
        amount: habits.delivery,
      },
      {
        id: "coffee",
        label: "Coffee",
        kind: "expense",
        frequency: "month",
        amount: habits.coffee,
      },
      {
        id: "invest",
        label: "Invest",
        kind: "investment",
        frequency: "month",
        amount: habits.invest,
      },
      {
        id: "save",
        label: "Save",
        kind: "saving",
        frequency: "payday",
        amount: habits.savePerPayday,
      },
    ]
  );
}

export const PROJECTION_START_YEAR = 2026;
export const DEFAULT_TARGET_YEAR = 2036;
export const MAX_TARGET_YEAR = 2076;
export const frequencyLabel = (frequency: Habit["frequency"]) =>
  ({
    day: "daily",
    week: "weekly",
    month: "monthly",
    year: "yearly",
    payday: "each payday",
  })[frequency];
export const frequencyPhrase = (frequency: Habit["frequency"]) =>
  ({
    day: "per day",
    week: "per week",
    month: "per month",
    year: "per year",
    payday: "each payday",
  })[frequency];
export function monthlyHabitAmount(item: Habit, paychecks: number) {
  const factor = {
    day: 365 / 12,
    week: 52 / 12,
    month: 1,
    year: 1 / 12,
    payday: paychecks,
  }[item.frequency];
  return item.amount * factor;
}

export function habitTotals(habits: Habits, paychecks: number) {
  const totals = { expense: 0, saving: 0, investment: 0 };
  for (const item of habitItems(habits))
    totals[item.kind] += monthlyHabitAmount(item, paychecks);
  return totals;
}

export function habitsFromItems(
  items: Habit[],
  paychecks: number,
  statement = "",
  targetYear?: number,
): Habits {
  const draft: Habits = {
    delivery: 0,
    coffee: 0,
    invest: 0,
    savePerPayday: 0,
    items: items.map((item) => ({ ...item })),
    statement,
    ...(targetYear === undefined ? {} : { targetYear }),
  };
  const totals = habitTotals(draft, paychecks);
  draft.delivery =
    items.find((item) => item.id === "delivery" && item.kind === "expense")
      ?.amount ?? 0;
  draft.coffee =
    items.find((item) => item.id === "coffee" && item.kind === "expense")
      ?.amount ?? 0;
  draft.invest = totals.investment;
  draft.savePerPayday =
    Math.round((totals.saving / Math.max(1, paychecks)) * 100) / 100;
  return draft;
}

export function firstSavingsAmount(habits: Habits) {
  return (
    habitItems(habits).find((item) => item.kind === "saving" && item.amount > 0)
      ?.amount ?? 0
  );
}
export type FuturePoint = {
  year: number;
  month: number;
  netWorth: number;
  savings: number;
  investments: number;
  checking: number;
};
export type FutureProjection = {
  points: FuturePoint[];
  end: FuturePoint;
  mood: "stressed" | "okay" | "thriving";
  greeting: string;
  income: number;
  spending: number;
  surplus: number;
  feasible: boolean;
  milestones: { label: string; hit: boolean }[];
};
export function spendingProfile(state: SimState) {
  validateState(state);
  const purchases = state.txns.filter((t) => t.type === "purchase");
  const insights = spendingInsights(state);
  const delivery = insights.find((i) => i.category === "Delivery")!.amount,
    coffee = insights.find((i) => i.category === "Coffee")!.amount;
  const income = payroll(state).reduce((s, t) => s + t.amount, 0);
  const spending =
    state.bills.reduce((s, b) => s + b.amount, 0) +
    purchases.reduce((s, t) => s + t.amount, 0);
  return {
    income,
    spending,
    delivery: Math.round(delivery * 100) / 100,
    coffee: Math.round(coffee * 100) / 100,
    other: spending - delivery - coffee,
    paychecks: paydayDates(state).length,
  };
}
export function defaultHabits(state: SimState): Habits {
  const p = spendingProfile(state);
  return {
    delivery: p.delivery,
    coffee: p.coffee,
    invest: 0,
    savePerPayday: 0,
  };
}
export function projectFuture(
  state: SimState,
  habits: Habits,
  targetYear = habits.targetYear ?? DEFAULT_TARGET_YEAR,
): FutureProjection {
  if (
    !Number.isInteger(targetYear) ||
    targetYear <= PROJECTION_START_YEAR ||
    targetYear > MAX_TARGET_YEAR
  )
    throw Error(
      `Choose a whole year from ${PROJECTION_START_YEAR + 1} to ${MAX_TARGET_YEAR}.`,
    );
  const months = (targetYear - PROJECTION_START_YEAR) * 12;
  // Labels may be temporarily blank while editing; all numeric and enum fields
  // still require valid amounts. Imported category totals can exceed the
  // editor’s per-habit limit without breaking the baseline projection.
  ottoSchemas.habits
    .extend({
      delivery: z.number().finite().min(0).max(1e9),
      coffee: z.number().finite().min(0).max(1e9),
    })
    .parse({
      ...habits,
      items: habits.items?.map((item) => ({
        ...item,
        label: item.label.trim() || "Habit",
      })),
    });
  const p = spendingProfile(state),
    round = (n: number) => Math.round(n * 100) / 100;
  let checking = state.checking,
    savings = state.savings,
    investments = 0;
  const points: FuturePoint[] = [
    {
      year: PROJECTION_START_YEAR,
      month: 0,
      netWorth: round(checking + savings),
      checking,
      savings,
      investments,
    },
  ];
  const cashRate = Math.pow(1.03, 1 / 12) - 1,
    investmentRate = Math.pow(1.06, 1 / 12) - 1;
  const totals = habitTotals(habits, p.paychecks);
  const baseSpending = p.other + totals.expense;
  for (let month = 1; month <= months; month++) {
    const growth = Math.pow(1.02, (month - 1) / 12);
    checking += (p.income - baseSpending) * growth;
    const invested = Math.min(totals.investment, Math.max(0, checking - 200));
    checking -= invested;
    investments += invested;
    const saved = Math.min(totals.saving, Math.max(0, checking - 200));
    checking -= saved;
    savings += saved;
    savings *= 1 + cashRate;
    investments *= 1 + investmentRate;
    points.push({
      year: PROJECTION_START_YEAR + month / 12,
      month,
      checking: round(checking),
      savings: round(savings),
      investments: round(investments),
      netWorth: round(checking + savings + investments),
    });
  }
  const end = points[months],
    liquid = end.checking + end.savings,
    finalSpending =
      baseSpending * Math.pow(1.02, targetYear - PROJECTION_START_YEAR);
  const mood =
    end.netWorth < 0 || liquid < finalSpending * 3
      ? "stressed"
      : end.netWorth >= 50000 && liquid >= finalSpending * 6
        ? "thriving"
        : "okay";
  const greeting =
    mood === "stressed"
      ? "Hey. We need to talk about our safety cushion."
      : mood === "thriving"
        ? "You gave us options. Thank you for starting."
        : habits.delivery < p.delivery
          ? "Those smaller delivery bills gave us room to breathe."
          : "We made progress. A few small choices could go further.";
  return {
    points,
    end,
    mood,
    greeting,
    income: round(p.income),
    spending: round(baseSpending),
    surplus: round(p.income - baseSpending),
    feasible:
      totals.investment + totals.saving <= p.income - baseSpending + 0.000001,
    milestones: [
      { label: "3-month emergency cushion", hit: liquid >= finalSpending * 3 },
      { label: "$10,000 invested", hit: end.investments >= 10000 },
      { label: "$50,000 modeled net worth", hit: end.netWorth >= 50000 },
    ],
  };
}
