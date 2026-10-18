import type { SimState } from "./simTypes";
// Refunds and reimbursements are cash inflows, but not recurring payroll.
export const payroll = (state: SimState) =>
  state.txns.filter(
    (t) =>
      t.type === "deposit" &&
      /paycheck|payroll|salary|wage|gig|income|direct deposit|stipend/i.test(
        t.desc,
      ) &&
      !/refund|reimburs|cashback|cash back|reversal|gift/i.test(t.desc),
  );
export const paydayDates = (state: SimState) =>
  [...new Set(payroll(state).map((t) => t.day))].sort((a, b) => a - b);
export function validateState(state: SimState) {
  if (
    !state ||
    !Number.isFinite(state.checking) ||
    !Number.isFinite(state.savings) ||
    Math.abs(state.checking) > 1e9 ||
    state.savings > 1e9 ||
    state.savings < 0 ||
    !Array.isArray(state.bills) ||
    !Array.isArray(state.txns)
  )
    throw new Error("Invalid account balances or month data.");
  const day = (n: number) => Number.isInteger(n) && n >= 1 && n <= 30;
  const money = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1e9;
  if (
    state.bills.some(
      (b) =>
        !b ||
        typeof b.id !== "string" ||
        !b.id ||
        typeof b.payee !== "string" ||
        !b.payee.trim() ||
        !money(b.amount) ||
        !day(b.dueDay),
    ) ||
    new Set(state.bills.map((b) => b.id)).size !== state.bills.length ||
    state.txns.some(
      (t) =>
        !t ||
        !day(t.day) ||
        !money(t.amount) ||
        !["deposit", "purchase", "transfer"].includes(t.type) ||
        typeof t.desc !== "string",
    )
  )
    throw new Error(
      "Transactions and bills need valid amounts and whole days from 1 to 30.",
    );
}
