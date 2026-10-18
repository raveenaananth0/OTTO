type Account = { _id: string; nickname: string; balance: number };
type Bill = {
  _id: string;
  payee: string;
  payment_amount: number;
  recurring_date?: number;
  upcoming_payment_date?: string;
  payment_date?: string;
  status: string;
};
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const key = process.env.NESSIE_KEY;
  if (!key)
    throw new Error(
      "Connect your Nessie key in Floot to load sandbox banking data.",
    );
  const url = new URL(path, "https://prod-api.nessieisreal.com");
  url.searchParams.set("key", key);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Could not reach Nessie. Please try again.");
  }
  if (!response.ok)
    throw new Error(
      "Nessie returned HTTP " +
        response.status +
        ". Check the sandbox connection.",
    );
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    if (method === "GET")
      throw new Error("Nessie returned an unreadable response.");
    // Some successful Nessie updates return plain text instead of JSON.
    return undefined as T;
  }
  if (data && typeof data.code === "number" && data.code >= 400)
    throw new Error("Nessie rejected this request (code " + data.code + ").");
  return data as T;
}
async function getDemoAccounts() {
  const customers =
    await request<{ _id: string; first_name: string; last_name: string }[]>(
      "/customers",
    );
  const customer = customers.find(
    (c) => c.first_name === "Money" && c.last_name === "Autopilot Demo",
  );
  if (!customer)
    throw new Error(
      "Demo customer not found for this Nessie key. Connect the same key used by your seeded local app.",
    );
  const accounts = await request<Account[]>(
    "/customers/" + encodeURIComponent(customer._id) + "/accounts",
  );
  const checking = accounts.find(
    (a) => a.nickname === "Money Autopilot Checking",
  );
  const savings = accounts.find((a) => a.nickname === "Autopilot Savings");
  const recipient = accounts.find((a) => a.nickname === "Unfamiliar Recipient");
  if (!checking || !savings || !recipient)
    throw new Error("The Nessie demo accounts are incomplete.");
  return { checking, savings, recipient };
}
export const nessieApi = {
  transfer: (
    checkingId: string,
    savingsId: string,
    amount: number,
    description: string,
  ) =>
    request<{ objectCreated?: { _id: string } }>(
      "/accounts/" + encodeURIComponent(checkingId) + "/transfers",
      "POST",
      {
        medium: "balance",
        payee_id: savingsId,
        amount,
        transaction_date: new Date().toISOString().slice(0, 10),
        description,
      },
    ),
  stopBill: (id: string) =>
    request("/bills/" + encodeURIComponent(id), "PUT", { status: "cancelled" }),
  getDemoAccounts,
  getBills: (id: string) =>
    request<Bill[]>("/accounts/" + encodeURIComponent(id) + "/bills"),
};
