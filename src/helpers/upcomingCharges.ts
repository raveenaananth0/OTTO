import type { SimState } from "./simTypes";
import { growAnalysis, defaultGrowSettings, samePayee } from "./grow";
import { subscriptionProvider } from "./subscriptions";

export function upcomingCharges(
  state: SimState,
  source: "demo" | "nessie",
  today = new Date().toISOString().slice(0, 10),
) {
  const active =
    source === "nessie"
      ? ((state as SimState & { activeBills?: SimState["bills"] })
          .activeBills ?? state.bills)
      : state.bills;
  const bills = [...active];
  for (const bill of state.bills) {
    if (!bills.some((b) => b.id === bill.id || samePayee(b.payee, bill.payee)))
      bills.push(bill);
  }
  const subscriptions = bills.filter(
    (b) => subscriptionProvider(b) || b.id.startsWith("manual:"),
  );
  return growAnalysis(
    {
      ...state,
      bills: subscriptions,
      activeBills: subscriptions,
      txns: [],
    } as SimState,
    source,
    defaultGrowSettings,
    today,
  ).due;
}
