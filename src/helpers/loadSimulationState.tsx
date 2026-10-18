import { fakeMonth } from "./fakeMonth";
import { nessieApi } from "./nessieApi";
import type { SimState } from "./simTypes";

// Shared by the dashboard's data route and chat. Nessie credentials stay server-side.
export async function loadSimulationState(
  source: "demo" | "nessie",
): Promise<SimState> {
  if (source === "demo") return structuredClone(fakeMonth) as SimState;
  const { checking, savings, recipient } = await nessieApi.getDemoAccounts();
  const bills = await nessieApi.getBills(checking._id);
  return {
    checking: checking.balance,
    savings: savings.balance,
    bills: bills
      .filter(
        (bill) => bill.status === "pending" || bill.status === "recurring",
      )
      .map((bill) => {
        const date = bill.upcoming_payment_date || bill.payment_date;
        const dueDay =
          bill.recurring_date ?? (date ? Number(date.slice(8, 10)) : NaN);
        if (
          !Number.isInteger(dueDay) ||
          dueDay < 1 ||
          dueDay > 30 ||
          !Number.isFinite(bill.payment_amount)
        ) {
          throw new Error(
            "A Nessie bill cannot fit this 30-day demo. Check its due date and amount.",
          );
        }
        return {
          id: bill._id,
          payee: bill.payee,
          amount: bill.payment_amount,
          dueDay,
        };
      }),
    txns: (fakeMonth as SimState).txns.map((txn) => ({
      ...txn,
      payeeId: txn.type === "transfer" ? recipient._id : undefined,
    })),
  };
}
