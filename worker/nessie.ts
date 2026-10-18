import { samePayee } from "../src/helpers/grow";
import type { SimState } from "../src/helpers/simTypes";

// Only the seeded hackathon customer is exposed. No mutations or arbitrary proxy paths.
export async function loadNessie(
  key: string,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Promise<
  SimState & {
    purchaseSource: "nessie";
    warnings: string[];
    reportingMonth: string;
    observedPurchases: number;
    sandboxAccounts: { checking: string; savings: string };
    activeBills: SimState["bills"];
    oneTimeBillDates: Record<string, string>;
  }
> {
  if (!key) throw new Error("The sandbox connection is not configured.");
  const signal = AbortSignal.timeout(8000);
  async function get(path: string): Promise<any[]> {
    const url = new URL(path, "https://prod-api.nessieisreal.com");
    url.searchParams.set("key", key);
    let response: Response;
    try {
      response = await fetcher(url.href, { signal, redirect: "manual" });
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Fetch failed")
        .split(key)
        .join("[redacted]")
        .replace(/https?:\/\/\S+/g, "[redacted URL]");
      console.error("Nessie read failed:", message);
      throw new Error(
        "Nessie is unavailable. Try again or use the scripted demo.",
      );
    }
    if (!response.ok)
      throw new Error(
        "Nessie could not load the demo accounts. Try again shortly.",
      );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("Nessie returned an invalid response.");
    }
    if (!Array.isArray(data))
      throw new Error("Nessie returned an invalid response.");
    return data;
  }
  const customers = await get("/customers");
  const customer = customers.find(
    (c) => c.first_name === "Money" && c.last_name === "Autopilot Demo",
  );
  if (!customer)
    throw new Error("The seeded OTTO sandbox customer was not found.");
  const accounts = await get(
    `/customers/${encodeURIComponent(customer._id)}/accounts`,
  );
  const checking = accounts.find(
    (a) => a.nickname === "Money Autopilot Checking",
  );
  const savings = accounts.find((a) => a.nickname === "Autopilot Savings");
  if (
    !checking ||
    !savings ||
    typeof checking._id !== "string" ||
    !checking._id ||
    typeof savings._id !== "string" ||
    !savings._id ||
    !Number.isFinite(checking.balance) ||
    !Number.isFinite(savings.balance)
  )
    throw new Error("The seeded OTTO sandbox accounts are incomplete.");
  const warnings: string[] = [];
  async function optional(path: string, label: string) {
    try {
      return await get(path);
    } catch {
      warnings.push(
        label + " unavailable; balances and available records are retained.",
      );
      return [];
    }
  }
  const accountPath = `/accounts/${encodeURIComponent(checking._id)}`;
  const [bills, purchases, deposits] = await Promise.all([
    optional(accountPath + "/bills", "Bills"),
    optional(accountPath + "/purchases", "Purchase history"),
    optional(accountPath + "/deposits", "Deposit history"),
  ]);
  const now = new Date(),
    reportingMonth = now.toISOString().slice(0, 7);
  function calendarDate(value: unknown) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return null;
    const parsed = new Date(value + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  function date(value: unknown) {
    const valid = calendarDate(value);
    return valid && new Date(valid + "T00:00:00Z") <= now ? valid : null;
  }
  function validRecord(p: any, field: string) {
    return (
      p &&
      !["cancelled", "pending"].includes(p.status) &&
      Number.isFinite(p.amount) &&
      p.amount >= 0 &&
      date(p[field])?.startsWith(reportingMonth)
    );
  }
  const validPurchases = purchases.filter((p) =>
    validRecord(p, "purchase_date"),
  );
  if (
    validPurchases.length !==
    purchases.filter((p) => p && !["cancelled", "pending"].includes(p.status))
      .length
  )
    warnings.push("Out-of-period or invalid purchase records were excluded.");
  const merchantIds = [
    ...new Set<string>(
      validPurchases
        .filter(
          (p) => !p.description?.trim() && typeof p.merchant_id === "string",
        )
        .map((p) => p.merchant_id),
    ),
  ].slice(0, 30);
  const merchantNames = new Map<string, string>();
  await Promise.all(
    merchantIds.map(async (id) => {
      try {
        // Merchant detail is an object, unlike the account list endpoints.
        const url = new URL(
          "/merchants/" + encodeURIComponent(id),
          "https://prod-api.nessieisreal.com",
        );
        url.searchParams.set("key", key);
        const response = await fetcher(url.href, {
          signal,
          redirect: "manual",
        });
        if (response.ok) {
          const m: any = await response.json();
          if (typeof m?.name === "string") merchantNames.set(id, m.name);
        }
      } catch {}
    }),
  );
  const compressedDay = (value: string) =>
    Math.min(30, Number(value.slice(8, 10)));
  const txns: SimState["txns"] = [
    ...validPurchases.map((p) => ({
      day: compressedDay(p.purchase_date),
      type: "purchase" as const,
      amount: p.amount,
      desc:
        typeof p.description === "string" && p.description.trim()
          ? p.description.trim()
          : merchantNames.get(p.merchant_id) || "Uncategorized purchase",
    })),
    ...deposits
      .filter((p) => validRecord(p, "transaction_date"))
      .map((p) => ({
        day: compressedDay(p.transaction_date),
        type: "deposit" as const,
        amount: p.amount,
        desc:
          typeof p.description === "string"
            ? p.description
            : "Unclassified deposit",
      })),
  ].sort((a, b) => a.day - b.day);
  const importedBills: SimState["bills"] = [];
  const oneTimeBillDates: Record<string, string> = {};
  for (const b of bills.filter(
    (b) => b && ["pending", "recurring"].includes(b.status),
  )) {
    if (
      b.recurring_date == null &&
      !calendarDate(b.upcoming_payment_date || b.payment_date)?.startsWith(
        reportingMonth,
      )
    ) {
      warnings.push("An invalid or out-of-period bill date was excluded.");
      continue;
    }
    const rawDay =
      b.recurring_date ??
      Number((b.upcoming_payment_date || b.payment_date || "").slice(8, 10));
    if (
      !Number.isInteger(rawDay) ||
      rawDay < 1 ||
      rawDay > 31 ||
      !Number.isFinite(b.payment_amount) ||
      b.payment_amount < 0 ||
      typeof b.payee !== "string" ||
      typeof b._id !== "string" ||
      importedBills.some((x) => x.id === b._id)
    ) {
      warnings.push("An invalid bill was excluded; review the bill schedule.");
      continue;
    }
    if (
      rawDay === 31 ||
      validPurchases.some((p) => p.purchase_date.endsWith("-31"))
    )
      warnings.push(
        "Day 31 bills are placed on day 30 in the 30-day simulation.",
      );
    if (b.status === "pending" && b.recurring_date == null)
      oneTimeBillDates[b._id] = b.upcoming_payment_date || b.payment_date;
    importedBills.push({
      id: b._id,
      payee: b.payee,
      amount: b.payment_amount,
      dueDay: Math.min(30, rawDay),
    });
  }
  const scheduledBills = importedBills.filter(
    (b) =>
      !txns.some(
        (t) =>
          t.type === "purchase" &&
          samePayee(t.desc, b.payee) &&
          Math.abs(t.amount - b.amount) < 0.01,
      ),
  );
  if (scheduledBills.length !== importedBills.length)
    warnings.push(
      "Recurring bills already represented by a matching completed purchase are counted once.",
    );
  warnings.push(
    "Sandbox history is month-to-date, not a full-month forecast. No sample paychecks or purchases are added. Simulation replays the imported schedule from today's balances.",
  );
  return {
    checking: checking.balance,
    savings: savings.balance,
    bills: scheduledBills,
    txns,
    purchaseSource: "nessie",
    warnings: [...new Set(warnings)],
    reportingMonth,
    observedPurchases: validPurchases.length,
    sandboxAccounts: { checking: checking._id, savings: savings._id },
    activeBills: importedBills,
    oneTimeBillDates,
  };
}
