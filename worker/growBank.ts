import { loadNessie } from "./nessie";
export class Rejected extends Error {}
export type BankSnapshot = {
  state: Awaited<ReturnType<typeof loadNessie>>;
  from: string;
  to: string;
};
export function growBank(key: string, fetcher: typeof fetch = fetch) {
  async function call(path: string, body?: unknown) {
    const url = new URL(path, "https://prod-api.nessieisreal.com");
    url.searchParams.set("key", key);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw Error(
        "Nessie response is uncertain. No automatic resubmission will be made.",
      );
    }
    if (!response.ok) {
      if (body && [400, 401, 403, 404, 422].includes(response.status))
        throw new Rejected(
          "Nessie rejected this transfer (HTTP " + response.status + ").",
        );
      throw Error(
        "Nessie could not verify this request (HTTP " + response.status + ").",
      );
    }
    try {
      return (await response.json()) as any;
    } catch {
      throw Error("Nessie returned an unreadable receipt.");
    }
  }
  return {
    async snapshot(): Promise<BankSnapshot> {
      if (!key) throw Error("Nessie is not configured.");
      const state = await loadNessie(key, fetcher);
      if (
        state.warnings.some((w) =>
          /bills unavailable|invalid bill|invalid or out-of-period bill|purchase history unavailable/i.test(
            w,
          ),
        )
      )
        throw Error("Bank history is incomplete. Refresh before moving funds.");
      return {
        state,
        from: state.sandboxAccounts.checking,
        to: state.sandboxAccounts.savings,
      };
    },
    async create(
      amount: number,
      description: string,
      date: string,
      from: string,
    ) {
      // This deployed API takes whole dollars and status; it rejects legacy medium/payee_id.
      if (!Number.isInteger(amount) || amount < 1 || amount > 1000)
        throw new Rejected(
          "Nessie transfers require whole dollars from $1 to $1,000.",
        );
      const result = await call(
        "/accounts/" + encodeURIComponent(from) + "/transfers",
        { amount, status: "completed", transaction_date: date, description },
      );
      const receipt = result?.objectCreated ?? result;
      const id = receipt?._id ?? receipt?.id;
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
        throw Error("Nessie did not return a valid transfer reference.");
      return id;
    },
    async balances(from: string, to: string) {
      const [a, b] = await Promise.all([
        call("/accounts/" + encodeURIComponent(from)),
        call("/accounts/" + encodeURIComponent(to)),
      ]);
      if (!Number.isFinite(a?.balance) || !Number.isFinite(b?.balance))
        throw Error("Native balances cannot be verified.");
      return { checking: a.balance, savings: b.balance };
    },
    async receipt(id: string) {
      return call("/transfers/" + encodeURIComponent(id));
    },
  };
}
export type GrowBank = ReturnType<typeof growBank>;
