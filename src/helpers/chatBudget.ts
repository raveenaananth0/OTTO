import type { SimState } from "./simTypes";
import { paydayDates } from "./payroll";
import {
  growAnalysis,
  defaultGrowSettings,
  samePayee,
  type GrowSettings,
} from "./grow";
const cents = (n: number) => Math.round(n * 100);
export type ChatSettings = Pick<
  GrowSettings,
  "nextPayday" | "buffer" | "emergencyMonths"
>;
export function chatGrowSettings(settings?: ChatSettings): GrowSettings {
  return { ...defaultGrowSettings, ...settings };
}
export function chatBudget(
  state: SimState,
  checking: number,
  source: "demo" | "nessie",
  day: number,
  settings: ChatSettings = defaultGrowSettings,
  today = new Date().toISOString().slice(0, 10),
) {
  if (source === "nessie" && day === 0) {
    const a = growAnalysis(state, source, chatGrowSettings(settings), today);
    const due = a.confirmedPayday
      ? a.due.filter((b) => b.date < a.through)
      : a.due;
    const bills = due.reduce((sum, b) => sum + cents(b.amount), 0);
    // Mirror Grow's daily-average estimate, shortened to exclude payday itself.
    const purchaseCents = state.txns
      .filter(
        (t) =>
          t.type === "purchase" &&
          ![
            ...((state as SimState & { activeBills?: SimState["bills"] })
              .activeBills ?? []),
            ...state.bills,
          ].some(
            (b) =>
              samePayee(b.payee, t.desc) && cents(b.amount) === cents(t.amount),
          ),
      )
      .reduce((sum, t) => sum + cents(t.amount), 0);
    const days = a.days - (a.confirmedPayday ? 1 : 0);
    const everyday = Math.ceil(
      (purchaseCents / Number(today.slice(-2))) * days,
    );
    const reserve = bills + everyday + cents(settings.buffer);
    return {
      bills: due,
      billTotal: bills / 100,
      spending: everyday / 100,
      buffer: settings.buffer,
      room: (cents(checking) - reserve) / 100,
      horizon: a.confirmedPayday
        ? `your ${a.through} payday`
        : `${a.through} (next 30 days; payday unconfirmed)`,
      payday: undefined,
    };
  }
  const payday = paydayDates(state).find((d) => d > day);
  const end = payday ?? 31;
  const bills = state.bills
    .filter((b) => b.dueDay > day && b.dueDay < end)
    .sort((a, b) => a.dueDay - b.dueDay);
  const outgoing = state.txns.filter(
    (t) =>
      t.day > day &&
      t.day < end &&
      (t.type === "purchase" || (t.type === "transfer" && t.amount <= 500)),
  );
  const billTotal = bills.reduce((s, b) => s + cents(b.amount), 0),
    spending = outgoing.reduce((s, t) => s + cents(t.amount), 0);
  return {
    bills,
    billTotal: billTotal / 100,
    spending: spending / 100,
    buffer: settings.buffer,
    room:
      (cents(checking) - billTotal - spending - cents(settings.buffer)) / 100,
    horizon: payday
      ? `your day ${payday} paycheck`
      : "month end (no later paycheck recorded)",
    payday,
  };
}
