import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOperation, type Operation } from "./growLedger";

const operation: Operation = {
  id: "operation",
  phase: "completed",
  amount: 123,
  payload: JSON.stringify({
    checking: 1399.49,
    savings: 1501.01,
    from: "checking",
    to: "savings",
    memo: "internal",
  }),
  receipt: "nessie-receipt",
  error: null,
  created: 1000,
  updated: 2000,
};
test("verified receipt exposes cent-accurate OTTO before/after balances without internal payload", () => {
  const receipt = publicOperation(operation);
  assert.deepEqual(receipt.balances, {
    checkingBefore: 1399.49,
    checkingAfter: 1398.26,
    savingsBefore: 1501.01,
    savingsAfter: 1502.24,
  });
  assert.equal(receipt.verifiedAt, 2000);
  assert.equal(receipt.amount, 1.23);
  assert.ok(!("payload" in receipt));
});
test("unverified transfers never claim verified balance changes", () => {
  for (const phase of [
    "review",
    "submitting",
    "pending",
    "uncertain",
    "failed",
  ]) {
    const receipt = publicOperation({ ...operation, phase });
    assert.equal(receipt.balances, undefined);
    assert.equal(receipt.verifiedAt, undefined);
  }
});
test("old receipts remain readable when historical balance snapshots are missing", () => {
  for (const payload of ["{}", "invalid JSON"]) {
    const receipt = publicOperation({ ...operation, payload });
    assert.equal(receipt.receipt, "nessie-receipt");
    assert.equal(receipt.balances, undefined);
  }
});
