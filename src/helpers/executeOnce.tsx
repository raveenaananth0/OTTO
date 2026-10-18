export type ActionReceipt = {
  status: string;
  detail: string;
  externalId?: string;
};
export type ActionLedger = {
  reserve: (
    key: string,
  ) => Promise<{ created: boolean; receipt: ActionReceipt }>;
  finish: (key: string, receipt: ActionReceipt) => Promise<void>;
};
// Reserve durably BEFORE calling the provider. An ambiguous outcome is never retried automatically.
export async function executeOnce(
  key: string,
  ledger: ActionLedger,
  perform: () => Promise<ActionReceipt>,
): Promise<ActionReceipt> {
  const entry = await ledger.reserve(key);
  if (!entry.created) return entry.receipt;
  let receipt: ActionReceipt;
  try {
    receipt = await perform();
  } catch {
    receipt = {
      status: "unknown",
      detail:
        "The result could not be verified. OTTO will not retry automatically. Check Nessie before taking another action.",
    };
  }
  await ledger.finish(key, receipt);
  return receipt;
}
