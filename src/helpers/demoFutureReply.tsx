import type { SimState } from "./simTypes";
import {
  projectFuture,
  habitItems,
  frequencyPhrase,
  spendingProfile,
  type Habits,
} from "./projectFuture";
// A deliberately labeled local-demo fallback. It never calls or imitates a live model.
export function demoFutureReply(
  state: SimState,
  habits: Habits,
  question: string,
) {
  const p = projectFuture(state, habits),
    profile = spendingProfile(state),
    money = (n: number) =>
      n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    q = question.toLowerCase();
  if (/^(hi|hello|hey|hello otto|hi otto)[!.?\s]*$/.test(q))
    return (
      `Hey, it's the modeled ${p.end.year} me. In this timeline, we end up with ` +
      money(p.end.netWorth) +
      " in net worth, with an outlook I would describe as " +
      p.mood +
      " outlook. What would you like to explore?"
    );
  if (/deliver|doordash/.test(q))
    return (
      "The scripted month includes " +
      money(profile.delivery) +
      " in delivery purchases. This timeline models " +
      money(p.spending) +
      " in total monthly spending and " +
      money(p.surplus) +
      ` left after expenses. Those small choices add up through ${p.end.year}.`
    );
  if (
    /habit|change|mean|glad|start|future|progress|afford|worth|sav|invest/.test(
      q,
    )
  ) {
    const chosen =
      habitItems(habits)
        .filter((h) => h.amount > 0)
        .map(
          (h) =>
            h.label +
            ": " +
            money(h.amount) +
            (" " + frequencyPhrase(h.frequency)),
        )
        .join("; ") || "no editable habit allocations";
    return (
      `In our selected timeline, modeled ${p.end.year} net worth is ` +
      money(p.end.netWorth) +
      ", including " +
      money(p.end.savings) +
      " in savings and " +
      money(p.end.investments) +
      " invested. Our plan is " +
      chosen +
      ". " +
      (p.feasible
        ? "The goals fit the modeled monthly surplus of " +
          money(p.surplus) +
          "."
        : "The goals exceed our monthly room, so the graph only contributes available cash; we need to adjust before committing.")
    );
  }
  return (
    "I can explain this demo timeline: modeled net worth reaches " +
    money(p.end.netWorth) +
    ` in ${p.end.year}, with ` +
    money(p.surplus) +
    " of monthly room before savings and investing goals. Try asking what our habits mean, how savings change, or how much delivery costs. Open-ended AI replies will be available after a model service is connected."
  );
}
