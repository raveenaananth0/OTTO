import type { SimState } from "../src/helpers/simTypes";
export type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};
export type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
};
export type Operation = {
  id: string;
  phase: string;
  amount: number;
  payload: string;
  receipt: string | null;
  error: string | null;
  created: number;
  updated: number;
};
export async function growTotal(db: Database) {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM grow_operations WHERE phase='completed'",
    )
    .first<{ total: number }>();
  const total = Number(row?.total || 0);
  if (!Number.isSafeInteger(total) || total < 0)
    throw Error("Invalid transfer ledger total.");
  return total;
}
export async function withGrowBalances<T extends SimState>(
  state: T,
  db?: Database,
): Promise<T> {
  if (!db) return state;
  const total = await growTotal(db);
  return {
    ...state,
    checking: (Math.round(state.checking * 100) - total) / 100,
    savings: (Math.round(state.savings * 100) + total) / 100,
    growAccounting: "Nessie receipts + persistent OTTO sandbox ledger",
    growMoved: total / 100,
  };
}
export const getOperation = (db: Database, id: string) =>
  db
    .prepare("SELECT * FROM grow_operations WHERE id=?")
    .bind(id)
    .first<Operation>();
export async function finish(
  db: Database,
  op: Operation,
  phase: "completed" | "failed",
  error: string | null = null,
) {
  await db.batch([
    db
      .prepare(
        "UPDATE grow_operations SET phase=?, error=?, updated=? WHERE id=? AND phase IN ('review','submitting','uncertain','pending')",
      )
      .bind(phase, error, Date.now(), op.id),
    db
      .prepare("DELETE FROM grow_locks WHERE pair='otto' AND operation=?")
      .bind(op.id),
  ]);
}
export function publicOperation(op: Operation) {
  let balances:
    | {
        checkingBefore: number;
        checkingAfter: number;
        savingsBefore: number;
        savingsAfter: number;
      }
    | undefined;
  if (op.phase === "completed") {
    try {
      const payload = JSON.parse(op.payload);
      if (Number.isFinite(payload.checking) && Number.isFinite(payload.savings))
        balances = {
          checkingBefore: payload.checking,
          checkingAfter: Math.round(payload.checking * 100 - op.amount) / 100,
          savingsBefore: payload.savings,
          savingsAfter: Math.round(payload.savings * 100 + op.amount) / 100,
        };
    } catch {
      /* Old receipts can still be shown without balance details. */
    }
  }
  return {
    id: op.id,
    status: op.phase,
    amount: op.amount / 100,
    receipt: op.receipt,
    message: op.error,
    accounting: "otto-sandbox-ledger",
    verifiedAt: op.phase === "completed" ? op.updated : undefined,
    balances,
  };
}
