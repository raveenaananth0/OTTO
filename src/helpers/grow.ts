import type { SimState, Bill } from "./simTypes";
import { validateState, paydayDates } from "./payroll";

export type GrowSettings = {
  nextPayday: string;
  buffer: number;
  emergencyMonths: number;
  apy: number;
  investmentReturn: number;
  contribution: number;
  cadence: "month" | "payday";
};
export const defaultGrowSettings: GrowSettings = {
  nextPayday: "",
  buffer: 200,
  emergencyMonths: 3,
  apy: 4,
  investmentReturn: 5,
  contribution: 100,
  cadence: "month",
};
export const payeeKey = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export const samePayee = (a: string, b: string) =>
  !!payeeKey(a) && payeeKey(a) === payeeKey(b);
export const cents = (value: number) => Math.round(value * 100);
const dollars = (value: number) => value / 100;
const DAY = 86400000;
export function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Choose a valid date.");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw Error("Choose a valid date.");
  return d;
}
export function growAnalysis(
  state: SimState,
  source: "demo" | "nessie",
  settings: GrowSettings,
  today = new Date().toISOString().slice(0, 10),
) {
  const metadata = state as SimState & {
    activeBills?: Bill[];
    oneTimeBillDates?: Record<string, string>;
  };
  const bills =
    source === "nessie" && metadata.activeBills
      ? [
          ...metadata.activeBills,
          ...state.bills.filter(
            (b) =>
              !metadata.activeBills!.some(
                (a) => a.id === b.id || samePayee(a.payee, b.payee),
              ),
          ),
        ]
      : state.bills;
  validateState({ ...state, bills });
  if (
    !Number.isFinite(settings.buffer) ||
    settings.buffer < 0 ||
    settings.buffer > 100000 ||
    !Number.isInteger(settings.emergencyMonths) ||
    settings.emergencyMonths < 1 ||
    settings.emergencyMonths > 12
  )
    throw Error(
      "Use a buffer from $0 to $100,000 and an emergency goal from 1 to 12 months.",
    );
  // The sample schedule starts before day 1. Live data is already reflected in current balances.
  const now = source === "demo" ? parseDate("2026-10-01") : parseDate(today);
  const startDay = source === "demo" ? 1 : now.getUTCDate();
  let end = new Date(now.getTime() + 30 * DAY),
    confirmedPayday = false;
  if (settings.nextPayday) {
    end = parseDate(settings.nextPayday);
    const distance = Math.round((end.getTime() - now.getTime()) / DAY);
    if (distance < 1 || distance > 45)
      throw Error("Next payday must be 1–45 days after the analysis date.");
    confirmedPayday = true;
  } else if (source === "demo") {
    const day = paydayDates(state).find((d) => d >= startDay);
    if (day) {
      end = new Date(Date.UTC(2026, 9, day));
      confirmedPayday = true;
    }
  }
  const days = Math.max(
    1,
    Math.round((end.getTime() - now.getTime()) / DAY) + 1,
  );
  const due: (Bill & { date: string })[] = [];
  for (const bill of bills) {
    const once = source === "nessie" && metadata.oneTimeBillDates?.[bill.id];
    if (once) {
      const date = parseDate(once);
      const payable = date < now ? now : date;
      if (payable <= end)
        due.push({ ...bill, date: payable.toISOString().slice(0, 10) });
      continue;
    }
    for (let month = 0; month < 3; month++) {
      const year = now.getUTCFullYear(),
        m = now.getUTCMonth() + month;
      const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      const date = new Date(Date.UTC(year, m, Math.min(bill.dueDay, last)));
      // Include payday's bills conservatively; payroll timing is not guaranteed.
      if (date >= now && date <= end)
        due.push({ ...bill, date: date.toISOString().slice(0, 10) });
    }
  }
  due.sort((a, b) => a.date.localeCompare(b.date));
  const billCents = due.reduce((sum, b) => sum + cents(b.amount), 0);
  const purchaseCents = state.txns
    .filter(
      (t) =>
        t.type === "purchase" &&
        !(
          source === "nessie" &&
          bills.some(
            (b) =>
              samePayee(b.payee, t.desc) && cents(b.amount) === cents(t.amount),
          )
        ),
    )
    .reduce((s, t) => s + cents(t.amount), 0);
  const elapsed = source === "demo" ? 30 : now.getUTCDate();
  // Live purchases are history, not future charges: reserve their observed daily average.
  const everydayCents =
    source === "demo"
      ? state.txns
          .filter(
            (t) =>
              t.type === "purchase" &&
              new Date(Date.UTC(2026, 9, t.day)) <= end,
          )
          .reduce((s, t) => s + cents(t.amount), 0)
      : Math.ceil((purchaseCents / elapsed) * days);
  const transferCents =
    source === "demo"
      ? state.txns
          .filter(
            (t) =>
              t.type === "transfer" &&
              // Match the simulation's hold rule: large unverified transfers
              // must not reserve checking cash for payment.
              t.amount <= 500 &&
              new Date(Date.UTC(2026, 9, t.day)) <= end,
          )
          .reduce((s, t) => s + cents(t.amount), 0)
      : 0;
  const reserveCents =
    billCents + everydayCents + transferCents + cents(settings.buffer);
  const monthlyCosts = dollars(
    bills.reduce((s, b) => s + cents(b.amount), 0) +
      Math.ceil((purchaseCents / elapsed) * 30),
  );
  const emergencyGoal = dollars(cents(monthlyCosts * settings.emergencyMonths));
  const gap = Math.max(0, dollars(cents(emergencyGoal) - cents(state.savings)));
  const idle = Math.max(0, dollars(cents(state.checking) - reserveCents));
  return {
    idle,
    reserve: dollars(reserveCents),
    billReserve: dollars(billCents),
    everydayReserve: dollars(everydayCents),
    transferReserve: dollars(transferCents),
    due,
    days,
    asOf: now.toISOString().slice(0, 10),
    through: end.toISOString().slice(0, 10),
    confirmedPayday,
    monthlyCosts,
    emergencyGoal,
    gap,
    emergencyReady: gap === 0 && emergencyGoal > 0,
    savingsMove: idle,
    historyThin: source === "nessie" && purchaseCents === 0,
  };
}

// APY is an annual effective yield. Contributions arrive at each period's end.
export function projection(
  initial: number,
  contribution: number,
  periodsPerYear: number,
  annualRate: number,
  years: number,
) {
  if (
    ![initial, contribution, periodsPerYear, annualRate, years].every(
      Number.isFinite,
    ) ||
    initial < 0 ||
    contribution < 0 ||
    periodsPerYear <= 0 ||
    annualRate <= -100 ||
    annualRate > 100 ||
    years < 0 ||
    years > 50
  )
    throw Error("Invalid projection inputs.");
  const rate = (1 + annualRate / 100) ** (1 / periodsPerYear) - 1;
  const periods = Math.round(periodsPerYear * years);
  const total =
    Math.abs(rate) < 1e-12
      ? initial + contribution * periods
      : initial * (1 + rate) ** periods +
        contribution * (((1 + rate) ** periods - 1) / rate);
  return {
    total: dollars(cents(total)),
    contributed: dollars(cents(initial + contribution * periods)),
    earnings: dollars(cents(total - initial - contribution * periods)),
  };
}

export function periodsFor(settings: GrowSettings, state: SimState) {
  // The payday example is explicitly twice monthly unless the sample schedule says otherwise.
  return settings.cadence === "month"
    ? 12
    : Math.max(1, paydayDates(state).length || 2) * 12;
}
