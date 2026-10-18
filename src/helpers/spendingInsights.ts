import type { SimState } from "./simTypes";
export type SpendingCategory =
  "Coffee" | "Delivery" | "Groceries" | "Transport" | "Dining" | "Other";
// Explainable merchant/description matching, not a trained ML model.
export function spendingCategory(description: string): SpendingCategory {
  const text = description
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  if (
    /\b(delivery|door\s*dash|uber\s*eats|grubhub|postmates|deliveroo)\b/.test(
      text,
    )
  )
    return "Delivery";
  if (
    /\b(coffee|starbucks|dunkin|espresso|cappuccino|latte|caffe|nero|costa|peet\s*s|cafe)\b/.test(
      text,
    )
  )
    return "Coffee";
  if (
    /\b(grocer\w*|whole foods|trader joe\w*|aldi|safeway|wegmans)\b/.test(text)
  )
    return "Groceries";
  if (/\b(gas|fuel|exxon|shell|uber|lyft|transit|metro)\b/.test(text))
    return "Transport";
  if (/\b(lunch|dinner|restaurant|food|chick fil a|mcdonald\w*)\b/.test(text))
    return "Dining";
  return "Other";
}
export function spendingInsights(state: SimState) {
  const categories: SpendingCategory[] = [
    "Coffee",
    "Delivery",
    "Groceries",
    "Transport",
    "Dining",
    "Other",
  ];
  return categories.map((category) => {
    const matches = state.txns.filter(
      (t) => t.type === "purchase" && spendingCategory(t.desc) === category,
    );
    return {
      category,
      amount: Math.round(matches.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      count: matches.length,
      descriptions: matches.map((t) => t.desc),
    };
  });
}
