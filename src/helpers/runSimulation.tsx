import type { Bill, Decision, SimState, Txn } from "./simTypes";
import { paydayDates, validateState } from "./payroll";

export type EngineResult = {
  decisions: Decision[];
  alerts?: { day: number; detail: string }[];
  billSchedule?: Bill[];
  dailyBalances: { day: number; checking: number; savings: number }[];
  score: {
    saved: number;
    overdraftsAvoided: number;
    scamsBlocked: number;
    interventions: number;
  };
};

// Work in cents so repeated transfers never accumulate floating-point drift.
const cents = (dollars: number) => Math.round(dollars * 100);
const dollars = (amount: number) => amount / 100;
const display = (amount: number) =>
  dollars(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

// A simulated encounter cannot establish a verified recipient. Keep large transfers
// on hold until an external verification flow exists, including missing recipient IDs.
function isSuspicious(txn: Txn, _seenPayees?: Set<string>): boolean {
  return txn.type === "transfer" && txn.amount > 500;
}

export function runSimulation(
  state: SimState,
  level: 0 | 1 | 2 | 3 | 4,
): EngineResult {
  validateState(state);
  if (![0, 1, 2, 3, 4].includes(level))
    throw new Error("Choose an autonomy level from 0 to 4.");
  // Copilot observes the untouched baseline and suggests actions without executing them.
  if (level === 1) {
    const baseline = runSimulation(state, 0);
    const suggestions = runSimulation(state, 2)
      .decisions.filter((d) => d.action !== "sweep_savings")
      .map((d) => ({
        day: d.day,
        detail: `Suggestion only: ${d.detail
          .replace(/^Moved /, "Move ")
          .replace(/^Held /, "Hold ")
          .replace(/^Swept /, "Sweep ")} No action taken.`,
      }));
    const firstOverdraft = baseline.dailyBalances.find((b) => b.checking < 0);
    if (firstOverdraft)
      suggestions.push({
        day: Math.max(1, firstOverdraft.day - 3),
        detail: `Warning: checking is projected to go negative on day ${firstOverdraft.day} (${display(cents(firstOverdraft.checking))}). No action taken.`,
      });
    return { ...baseline, alerts: suggestions.sort((a, b) => a.day - b.day) };
  }
  // Clone the schedule: moving a bill must never mutate the caller's data.
  const bills = state.bills.map((bill) => ({
    ...bill,
    amount: cents(bill.amount),
  }));
  // Stable sort preserves the supplied order of transactions within each day.
  const txns = [...state.txns].sort((a, b) => a.day - b.day);
  const paydayDays = paydayDates(state);
  const seenPayees = new Set<string>();
  let checking = cents(state.checking);
  let savings = cents(state.savings);
  const result: EngineResult = {
    decisions: [],
    dailyBalances: [],
    score: {
      saved: 0,
      overdraftsAvoided: 0,
      scamsBlocked: 0,
      interventions: 0,
    },
  };

  function decide(
    day: number,
    action: Decision["action"],
    detail: string,
    amount: number,
  ) {
    const needsApproval =
      level === 2 ||
      (level === 3 && (action === "hold_transfer" || amount > 50000));
    result.decisions.push({
      day,
      action,
      detail,
      amount: dollars(amount),
      needsApproval,
    });
    if (needsApproval) result.score.interventions++;
    // All requested approvals are assumed granted by the demo user.
  }

  for (let day = 1; day <= 30; day++) {
    const todaysTxns = txns.filter((txn) => txn.day === day);
    const held = new Set<Txn>();

    // 1. Screen transfers before bills, prevention, or sweeps change balances.
    for (const txn of todaysTxns) {
      if (level > 0 && isSuspicious(txn, seenPayees)) {
        held.add(txn);
        decide(
          day,
          "hold_transfer",
          `Held ${display(cents(txn.amount))} to an unfamiliar payee.`,
          cents(txn.amount),
        );
        result.score.scamsBlocked++;
      }
      // "Seen" means previously encountered in the chronological input, even if held.
      if (!held.has(txn) && txn.payeeId !== undefined)
        seenPayees.add(txn.payeeId);
    }

    if (level > 0) {
      // 2. Today's bills plus the next three days, leaving a $50 buffer.
      const upcomingBills = () =>
        bills.filter((bill) => bill.dueDay >= day && bill.dueDay <= day + 3);
      // Forecast daily net cash including purchases and all deposits. A paycheck
      // avoids a top-up only when its amount actually covers the day's outflows.
      const shortage = () => {
        let projected = checking,
          lowest = Infinity;
        for (let d = day; d <= Math.min(30, day + 3); d++) {
          projected += txns
            .filter((t) => t.day === d && t.type === "deposit")
            .reduce((s, t) => s + cents(t.amount), 0);
          projected -= bills
            .filter((b) => b.dueDay === d)
            .reduce((s, b) => s + b.amount, 0);
          projected -= txns
            .filter(
              (t) => t.day === d && t.type !== "deposit" && !isSuspicious(t),
            )
            .reduce((s, t) => s + cents(t.amount), 0);
          lowest = Math.min(lowest, projected);
        }
        return Math.max(0, 5000 - lowest);
      };
      const nextPayday = paydayDays.find((payday) => payday >= day);

      while (shortage() > 0) {
        const newDueDay = nextPayday === undefined ? undefined : nextPayday + 2;
        const movable = upcomingBills()
          .filter(
            (bill) =>
              newDueDay !== undefined &&
              bill.dueDay < newDueDay &&
              newDueDay > day + 3 &&
              newDueDay <= 30,
          )
          .sort((a, b) => a.dueDay - b.dueDay)[0];

        if (movable && newDueDay !== undefined) {
          const oldDay = movable.dueDay;
          movable.dueDay = newDueDay;
          decide(
            day,
            "move_bill",
            `Moved ${movable.payee} from day ${oldDay} to day ${newDueDay} to avoid overdraft.`,
            movable.amount,
          );
        } else {
          const amount = Math.min(shortage(), Math.max(0, savings));
          if (amount > 0) {
            checking += amount;
            savings -= amount;
            decide(
              day,
              "rebalance",
              `Moved ${display(amount)} from savings to cover upcoming spending.`,
              amount,
            );
          }
          break; // Savings can be exhausted; never invent money or loop forever.
        }
      }

      // 3. After a paycheck, reserve spending through the next payday.
      // At month end, only project through day 30; no next-month data is available.
      if (paydayDays.includes(day - 1)) {
        const horizon = Math.min(
          paydayDays.find((payday) => payday >= day) ?? 30,
          30,
        );
        let projected = checking;
        let lowest = checking;
        const futurePayees = new Set(seenPayees);
        for (let futureDay = day; futureDay <= horizon; futureDay++) {
          for (const bill of bills.filter(
            (bill) => bill.dueDay === futureDay,
          )) {
            projected -= bill.amount;
            lowest = Math.min(lowest, projected);
          }
          for (const txn of txns.filter((txn) => txn.day === futureDay)) {
            // The next paycheck is excluded so today's savings do not rely on it.
            const skip = held.has(txn) || isSuspicious(txn, futurePayees);
            if (txn.type !== "deposit" && !skip) projected -= cents(txn.amount);
            if (txn.payeeId !== undefined) futurePayees.add(txn.payeeId);
            lowest = Math.min(lowest, projected);
          }
        }
        const excess = lowest - 20000;
        if (excess > 0) {
          checking -= excess;
          savings += excess;
          result.score.saved = dollars(cents(result.score.saved) + excess);
          decide(
            day,
            "sweep_savings",
            `Swept ${display(excess)} into savings, keeping a $200 cushion.`,
            excess,
          );
        }
      }
    }

    // Apply bills once, on their current due dates, then today's unheld transactions.
    for (const bill of bills.filter((bill) => bill.dueDay === day))
      checking -= bill.amount;
    for (const txn of todaysTxns) {
      if (!held.has(txn))
        checking += (txn.type === "deposit" ? 1 : -1) * cents(txn.amount);
    }
    result.dailyBalances.push({
      day,
      checking: dollars(checking),
      savings: dollars(savings),
    });
  }

  result.billSchedule = bills.map((b) => ({ ...b, amount: dollars(b.amount) }));
  if (level > 0) {
    const baseline = runSimulation(state, 0);
    // Count negative end-of-day balances avoided, rather than repeated rule checks.
    result.score.overdraftsAvoided = baseline.dailyBalances.filter(
      (balance, index) =>
        balance.checking < 0 && result.dailyBalances[index].checking >= 0,
    ).length;
  }
  return result;
}
