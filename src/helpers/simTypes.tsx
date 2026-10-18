export type Bill = {
  id: string;
  payee: string;
  amount: number;
  dueDay: number;
};
export type Txn = {
  day: number;
  type: "deposit" | "purchase" | "transfer";
  amount: number;
  desc: string;
  payeeId?: string;
};
export type SimState = {
  checking: number;
  savings: number;
  bills: Bill[];
  txns: Txn[];
};
export type Decision = {
  day: number;
  action: "move_bill" | "sweep_savings" | "rebalance" | "hold_transfer";
  detail: string;
  amount?: number;
  needsApproval: boolean;
};
