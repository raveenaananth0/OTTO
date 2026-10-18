import type { SimState } from "./simTypes";
import { fakeMonth } from "./fakeMonth";

// Projection-only composition. Never changes the banking store or calls an API.
export function futureState(
  state: SimState,
  source: "demo" | "nessie",
): SimState {
  return {
    ...state,
    bills: state.bills.map((bill) => ({ ...bill })),
    txns: (source === "nessie" ? fakeMonth.txns : state.txns)
      .filter(
        (txn) =>
          source !== "nessie" ||
          txn.type === "purchase" ||
          txn.type === "deposit",
      )
      .map((txn) => ({ ...txn })),
  };
}
