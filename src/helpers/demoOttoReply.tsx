import { bankDisplayText } from "./bankDisplayText";
import type { SimState } from "./simTypes";
import { runSimulation } from "./runSimulation";
import { spendingInsights } from "./spendingInsights";
import { spendingProfile } from "./projectFuture";
import { subscriptionProvider } from "./subscriptions";
import { paydayDates } from "./payroll";
import { growAnalysis, defaultGrowSettings, samePayee } from "./grow";
import { chatBudget, chatGrowSettings, type ChatSettings } from "./chatBudget";

// Read a whole monetary token: never silently turn $1,000 into $1.
export function questionAmount(question: string): number | null {
  if (/-\s*\$/.test(question)) throw Error("Use a positive dollar amount.");
  const tokens = [
    ...question.matchAll(
      /\$\s*([+-]?[\d][\d,.]*(?:[a-zA-Z][a-zA-Z0-9+-]*)?)|([+-]?[\d][\d,.]*)\s*dollars?\b/gi,
    ),
  ];
  if (!tokens.length) return null;
  let total = 0;
  for (const token of tokens) {
    const raw = (token[1] || token[2]).replace(/[.,]+$/, "");
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))
      throw Error(
        "Use a positive dollar amount with at most two decimal places, like $1,000.50.",
      );
    const amount = Number(raw.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9)
      throw Error("Use an amount greater than $0 and no more than $1 billion.");
    total += Math.round(amount * 100);
  }
  if (total > 1e11) throw Error("Use a total no greater than $1 billion.");
  return total / 100;
}

function buildOttoReply(
  state: SimState,
  level: 0 | 1 | 2 | 3 | 4,
  day: number,
  question: string,
  source: "demo" | "nessie" = "demo",
  today = new Date().toISOString().slice(0, 10),
  settings: ChatSettings = defaultGrowSettings,
) {
  const result = runSimulation(state, level),
    current = day ? result.dailyBalances[day - 1] : state;
  const budgetState =
    day > 0 && result.billSchedule
      ? { ...state, bills: result.billSchedule }
      : state;
  const q = question
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
    money = (n: number) =>
      n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (/^(thanks|thank you|thankyou|ty)(?:\s+otto)?[!.?\s]*$/.test(q))
    return "You’re welcome! Happy to help.";
  if (/^(hi|hey|hello)[!.?\s]*$/.test(q))
    return "Hi, I'm Otto. Ask me about your balances, bills, spending, or a decision in the simulation.";
  if (
    /\b(afford|affordable|buy|purchase|pay for)\b|\b(can|could|should|may) i (?:spend|pay)\b|\bwant to spend\b|enough (?:money )?for|\bconcert\b/.test(
      q,
    )
  ) {
    if (
      (state as any).warnings?.some((w: string) =>
        w.startsWith("Bills unavailable"),
      )
    )
      return "I can read your balance, but bill history is unavailable. I can't safely check affordability until your upcoming bills are loaded.";
    let amount: number | null;
    try {
      amount = questionAmount(q);
    } catch (error) {
      return (error as Error).message;
    }
    if (amount === null) return "Include the purchase amount, like $60.";
    const budget = chatBudget(
      budgetState,
      current.checking,
      source,
      day,
      settings,
      today,
    );
    const left =
      (Math.round(budget.room * 100) - Math.round(amount * 100)) / 100;
    return `${left >= 0 ? "Yes." : "No."} After the ${money(amount)} purchase, you’d have ${money(left)} left before ${budget.horizon}. Your checking is ${money(current.checking)}; reserve ${money(budget.billTotal)} for bills, ${money(budget.spending)} for expected spending, and ${money(budget.buffer)} as a buffer. Suspicious transfers are excluded.`;
  }
  if (/\bbroke\b/.test(q)) {
    const b = chatBudget(
      budgetState,
      current.checking,
      source,
      day,
      settings,
      today,
    );
    const names = b.bills.map((bill) => bill.payee).join(", ");
    return `${names || "No recorded bills"} (${money(b.billTotal)}) land before ${b.horizon}, against ${money(current.checking)} in checking. Expected spending is another ${money(b.spending)}. After your ${money(b.buffer)} buffer, ${money(b.room)} remains before new purchases${b.room < 0 ? ", so those costs exceed your available checking" : ""}. ${b.room < 0 ? "This timing squeezes your budget." : "These records do not show a shortfall before payday; missing spending or a different month could explain it."}`;
  }
  if (
    /\b(biggest|largest|top)\s+(expense|expenses|spending|cost|costs)|where (?:does|did|is) (?:all )?my money (?:go|going)|what do i spend (?:the )?most/.test(
      q,
    )
  ) {
    const categories = new Map<string, number>(
      spendingInsights({
        ...state,
        txns: state.txns.filter(
          (t) =>
            t.type !== "purchase" ||
            !state.bills.some(
              (b) =>
                samePayee(b.payee, t.desc) &&
                Math.round(b.amount * 100) === Math.round(t.amount * 100),
            ),
        ),
      }).map((i) => [i.category, i.amount]),
    );
    for (const bill of state.bills) {
      const category = /rent|mortgage/i.test(bill.payee)
        ? "Housing"
        : /insurance/i.test(bill.payee)
          ? "Insurance"
          : /phone|pepco|electric|internet|water|utility/i.test(bill.payee)
            ? "Utilities"
            : subscriptionProvider(bill)
              ? "Subscriptions"
              : "Other bills";
      categories.set(category, (categories.get(category) || 0) + bill.amount);
    }
    const top = [...categories]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    return top.length
      ? `Your largest categories across recorded purchases and scheduled bills are ${top.map(([name, amount]) => `${name}: ${money(amount)}`).join("; ")}. Transfers between accounts are excluded.`
      : "There are no purchases or bills in the available records to rank.";
  }
  if (/\bidle\s+(cash|money)\b/.test(q)) {
    const a = growAnalysis(state, source, chatGrowSettings(settings), today);
    return `You have ${money(a.idle)} in estimated idle cash. Grow keeps ${money(a.reserve)} for upcoming bills, spending and your ${money(settings.buffer)} buffer through ${a.through}. Open Grow to review the same calculation before moving anything.`;
  }
  if (/\bnet\s*worth\b/.test(q))
    return `Your net worth in these accounts is ${money(current.checking + current.savings)}: ${money(current.checking)} checking plus ${money(current.savings)} savings. This excludes any debts or investments you haven’t provided.`;
  if (
    /\b(suspicious|scam|fraud)\b|\$?900\b.*transfer|transfer.*\$?900\b/.test(q)
  ) {
    const txn = state.txns.find((t) => t.type === "transfer" && t.amount > 500);
    if (!txn)
      return "There’s no transfer over $500 in the available records. OTTO flags large, unverified transfers for review; that is a warning sign, not proof of fraud.";
    const index = state.txns.indexOf(txn);
    const seen =
      !!txn.payeeId &&
      state.txns.some(
        (t, i) =>
          (t.day < txn.day || (t.day === txn.day && i < index)) &&
          t.payeeId === txn.payeeId,
      );
    return `The ${money(txn.amount)} transfer on day ${txn.day} ${level <= 1 ? "would be held at level 2 or higher; this level does not block it" : "is held in the simulation"}: ${seen ? "the recipient is not independently verified" : "it goes to a new or unidentified payee"} and is over $500. Verify the recipient before approving. This chat has not sent or canceled a transfer.`;
  }
  if (/\b(should i invest|start investing|investing|invest|sip)\b/.test(q)) {
    const a = growAnalysis(
      { ...state, checking: current.checking, savings: current.savings },
      source,
      chatGrowSettings(settings),
      today,
    );
    const progress =
      a.emergencyGoal > 0
        ? Math.min(100, Math.round((current.savings / a.emergencyGoal) * 100))
        : 0;
    return a.emergencyGoal > 0
      ? `Your emergency fund has ${money(current.savings)} of a ${money(a.emergencyGoal)} goal (${progress}%). ${a.gap > 0 ? `Build the remaining ${money(a.gap)} cushion first.` : "Your modeled emergency-fund goal is covered."} Open Grow to review spare cash and explore a regular investing plan. Investments can lose value.`
      : "I need recurring cost records to estimate your emergency-fund goal. Open Grow to review your bills and buffer before exploring investing.";
  }
  const category = /\b(coffee|cafe|caffe)\b/.test(q)
    ? "Coffee"
    : /\b(delivery|doordash|door dash|uber eats)\b/.test(q)
      ? "Delivery"
      : /\b(groceries|grocery|supermarket)\b/.test(q)
        ? "Groceries"
        : /\b(gas|fuel|transport|transportation)\b/.test(q)
          ? "Transport"
          : /\b(dining|restaurants?)\b|eat(?:ing)? out/.test(q)
            ? "Dining"
            : null;
  if (category) {
    const insight = spendingInsights(state).find(
      (i) => i.category === category,
    )!;
    return `${category} totals ${money(insight.amount)} across ${insight.count} recorded purchases. I match merchant descriptions automatically; unrecognized purchases remain in Other.`;
  }
  if (/\b(subscription|subscriptions|cancel)\b/.test(q)) {
    const recurring = state.bills.filter(
      (b) => subscriptionProvider(b) || b.id.startsWith("manual:"),
    );
    return `Recognized subscriptions and manual recurring entries total ${money(recurring.reduce((s, b) => s + b.amount, 0))}. In Subscriptions, review services and add missing ones. Otto can track cancellation, but cannot cancel a merchant contract or charge your card.`;
  }
  if (/\b(autonomy|levels?|agent)\b/.test(q))
    return "Level 0 makes no decisions. Level 1 only warns and suggests, without changing balances. Level 2 requests every approval; level 3 requests holds and moves over $500; level 4 applies simulated decisions automatically. Payment execution is disabled.";
  if (/\boverdraft\b|move.*bill|(?:why|explain).*pepco/.test(q)) {
    const d =
      result.decisions.find(
        (d) => d.action === "move_bill" && /pepco/i.test(d.detail),
      ) || result.decisions.find((d) => d.action === "move_bill");
    return d
      ? `${day >= d.day ? "Simulation decision" : "Planned simulation decision for day " + d.day}: ${d.detail} No bank bill has been changed.`
      : `The simulation has ${result.dailyBalances.filter((b) => b.checking < 0).length} negative-balance days at level ${level}. If savings cannot cover spending, changing timing alone cannot prevent every overdraft.`;
  }
  if (/\b(checking|balance|balances|cash)\b/.test(q))
    return `${source === "nessie" && day === 0 ? "Your checking is" : `Your ${day ? "simulated day " + day : "starting"} checking is`} ${money(current.checking)}, and savings are ${money(current.savings)}. ${source === "nessie" ? "Balances come from your connected accounts." : "These balances come from the sample month."}`;
  if (/\b(savings?|sweeps?)\b/.test(q))
    return `Savings are ${money(current.savings)}. The level ${level} simulation sweeps ${money(result.score.saved)} in total; this is an internal transfer, not income.`;
  if (/\b(bills?|rent|insurance|electric|internet|phone|pepco)\b/.test(q)) {
    const namedBills = budgetState.bills.filter((b) =>
      q.includes(b.payee.toLowerCase()),
    );
    if (namedBills.length && !/before|upcoming|next payday/.test(q))
      return (
        namedBills
          .map(
            (b) =>
              `${b.payee} is ${money(b.amount)}, scheduled for day ${b.dueDay}.`,
          )
          .join(" ") + " This chat has not made a payment."
      );
    if (/before.*(?:payday|paycheck)/.test(q)) {
      const b = chatBudget(
        budgetState,
        current.checking,
        source,
        day,
        settings,
        today,
      );
      return b.bills.length
        ? `Before ${b.horizon}, scheduled bills total ${money(b.billTotal)}: ${b.bills.map((bill) => `${bill.payee} ${money(bill.amount)}`).join("; ")}. No payments have been made by this chat.`
        : `No recorded bills are due before ${b.horizon}. Missing records can affect this answer.`;
    }
    if (source === "nessie" && day === 0) {
      const due = growAnalysis(state, source, defaultGrowSettings, today).due;
      return due.length
        ? `Recorded bills through the next 30 days total ${money(due.reduce((sum, bill) => sum + bill.amount, 0))}: ${due
            .slice(0, 6)
            .map(
              (bill) => `${bill.payee} ${money(bill.amount)} on ${bill.date}`,
            )
            .join(
              "; ",
            )}${due.length > 6 ? "; plus other scheduled bills" : ""}. No payments have been made by this chat.`
        : "No upcoming bills were found in the available records. Missing records can affect this answer.";
    }
    const payday = paydayDates(state).find((d) => d > day) ?? 31;
    const bills = budgetState.bills
      .filter((b) => b.dueDay > day && b.dueDay < payday)
      .sort((a, b) => a.dueDay - b.dueDay);
    return bills.length
      ? `Before ${payday === 31 ? "month end" : `payday on day ${payday}`}, your bills total ${money(bills.reduce((s, b) => s + b.amount, 0))}: ${bills
          .slice(0, 6)
          .map((b) => `${b.payee} ${money(b.amount)} on day ${b.dueDay}`)
          .join(
            "; ",
          )}${bills.length > 6 ? "; plus other scheduled bills" : ""}. These are scheduled costs, not payments made by Otto.`
      : `There are no recorded bills due before ${payday === 31 ? "month end" : `payday on day ${payday}`}. Missing records can affect this answer.`;
  }
  if (/\b(payday|paycheck|payroll)\b/.test(q)) {
    if (source === "nessie" && day === 0) {
      if (settings.nextPayday) {
        const a = growAnalysis(
          state,
          source,
          chatGrowSettings(settings),
          today,
        );
        return `Your next payday is set to ${a.through} in Grow. That is your saved date; the bank history does not confirm a future paycheck amount.`;
      }
      const income = spendingProfile(state).income;
      return income > 0
        ? `Recorded payroll totals ${money(income)} in the available bank history. Past deposits do not confirm your next payday. Set your next payday in Grow before planning around that income.`
        : "No payroll is recorded in available bank history. Set your next payday in Grow; I won’t invent an amount or date.";
    }
    const payday = paydayDates(state).find((d) => d > day);
    return payday
      ? `Your next recorded payday is day ${payday}. Check the bill schedule before making plans for that money.`
      : "There is no upcoming payroll recorded in this month's data. I won't assume a paycheck amount or date.";
  }
  if (/\b(budget|income|expenses?|spending)\b|plan.*money/.test(q)) {
    const p = spendingProfile(state);
    return `${source === "nessie" ? "Connected account records" : "Sample month"}: Recorded payroll totals ${money(p.income)}, while bills and purchases total ${money(p.spending)}. That leaves ${money(p.income - p.spending)} in recorded monthly room, before savings goals. This may be a partial month; I can only use the records available.`;
  }
  return "I'm Otto's free financial assistant. I can check balances, upcoming bills, payday, coffee, delivery, subscriptions, and whether a purchase fits your schedule. Try ‘What bills are due before payday?’ or ‘Can I afford a $60 ticket?’ General open-ended AI is not enabled.";
}

export function demoOttoReply(...args: Parameters<typeof buildOttoReply>) {
  try {
    return bankDisplayText(buildOttoReply(...args));
  } catch {
    return "Check your next payday and buffer in Grow, then try again.";
  }
}
