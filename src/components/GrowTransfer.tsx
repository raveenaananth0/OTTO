import { bankDisplayText } from "../helpers/bankDisplayText";
import { useEffect, useRef, useState } from "react";
import { useOttoData } from "../helpers/useOttoData";
import { growAnalysis, type GrowSettings } from "../helpers/grow";
import { formatMoney as money } from "../helpers/formatMoney";
import { Button } from "./Button";
import s from "./OttoPage.module.css";
import g from "../pages/grow.module.css";
type Quote = {
  id: string;
  token: string;
  amount: number;
  from: string;
  to: string;
  reserve: number;
  remaining: number;
  fingerprint: string;
};
type Receipt = {
  id: string;
  status: string;
  amount: number;
  receipt: string | null;
  message?: string;
  verifiedAt?: number;
  balances?: {
    checkingBefore: number;
    checkingAfter: number;
    savingsBefore: number;
    savingsAfter: number;
  };
};
type Pending = { id: string; token: string };
const storageKey = "otto-grow-inflight";
function readPending(): Pending | null {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) || "null");
    return v &&
      typeof v.id === "string" &&
      /^[a-f0-9-]{36}$/i.test(v.id) &&
      typeof v.token === "string" &&
      /^[a-f0-9]{64}$/.test(v.token)
      ? v
      : null;
  } catch {
    return null;
  }
}
async function api(body?: unknown) {
  const r = await fetch(
    "/_api/grow",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const v = await r.json();
  if (!r.ok)
    throw Error(
      v.error ||
        v.message ||
        "Could not verify the transfer. Check its status before starting another.",
    );
  return v;
}
export default function GrowTransfer({ settings }: { settings: GrowSettings }) {
  const d = useOttoData(),
    [amount, setAmount] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [result, setResult] = useState<Receipt | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Pending | null>(readPending),
    [caps, setCaps] = useState<{
      transfersSupported: boolean;
      blocked?: boolean;
      recent?: Receipt[];
      reason?: string;
    } | null>(null),
    [storageNotice, setStorageNotice] = useState("");
  const lock = useRef(false),
    mounted = useRef(true),
    dialog = useRef<HTMLDialogElement>(null);
  let max = 0;
  try {
    max = Math.min(
      1000,
      Math.floor(growAnalysis(d.state, d.source, settings).idle),
    );
  } catch {}
  const fingerprint = JSON.stringify([
      d.source,
      d.state.checking,
      d.state.savings,
      d.state.bills,
      settings,
      amount,
    ]),
    current = useRef(fingerprint);
  current.current = fingerprint;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function refreshCaps() {
    try {
      const c = await api();
      if (mounted.current) setCaps(c);
    } catch (e) {
      if (mounted.current) {
        setCaps({
          transfersSupported: false,
          reason: "Transfer storage is unavailable.",
        });
      }
    }
  }
  useEffect(() => {
    void refreshCaps();
  }, [d.source, d.state.checking, d.state.savings]);
  useEffect(() => {
    if (quote && quote.fingerprint !== fingerprint && !busy) setQuote(null);
  }, [fingerprint, quote, busy]);
  useEffect(() => {
    if (quote && !dialog.current?.open) dialog.current?.showModal();
    else if (!quote) dialog.current?.close();
  }, [quote]);
  function remember(p: Pending | null) {
    setPending(p);
    try {
      if (p) localStorage.setItem(storageKey, JSON.stringify(p));
      else localStorage.removeItem(storageKey);
    } catch {
      setStorageNotice(
        "Browser storage is unavailable. The transfer remains recorded on the server; recent receipts show its outcome.",
      );
    }
  }
  async function accept(r: Receipt) {
    setResult(r);
    if (r.status === "completed") {
      setAmount("");
      setAck(false);
    }
    if (["completed", "failed", "review"].includes(r.status)) {
      remember(null);
      setQuote(null);
      window.dispatchEvent(new Event("otto-grow-updated"));
      void refreshCaps();
    }
  }
  async function status() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api({ action: "status", ...pending });
      if (mounted.current) await accept(r);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Status unavailable.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!pending || !["pending", "submitting"].includes(result?.status || ""))
      return;
    let count = 0;
    const t = window.setInterval(() => {
      if (++count > 12) {
        window.clearInterval(t);
        return;
      }
      void status();
    }, 1500);
    return () => window.clearInterval(t);
  }, [pending, result?.status]);
  async function review() {
    if (
      lock.current ||
      d.loading ||
      d.source !== "nessie" ||
      !ack ||
      !caps?.transfersSupported ||
      caps.blocked
    )
      return;
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      setError("Use whole dollars from $1 to " + max + ".");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    const before = fingerprint;
    try {
      const q = await api({
        action: "preview",
        amount: n,
        acknowledgeEstimate: true,
        settings: {
          nextPayday: settings.nextPayday,
          buffer: settings.buffer,
          emergencyMonths: settings.emergencyMonths,
        },
        manualBills: d.state.bills.filter((b) => b.id.startsWith("manual:")),
      });
      if (mounted.current && current.current === before)
        setQuote({ ...q, fingerprint: before });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function confirm() {
    if (
      lock.current ||
      !quote ||
      quote.fingerprint !== fingerprint ||
      d.loading ||
      d.source !== "nessie"
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    const p = { id: quote.id, token: quote.token };
    remember(p);
    try {
      const r = await api({ action: "confirm", ...p });
      if (!mounted.current && r.status === "completed")
        window.dispatchEvent(new Event("otto-grow-updated"));
      if (mounted.current) {
        setQuote(null);
        await accept(r);
      }
    } catch (e) {
      if (mounted.current) {
        setQuote(null);
        setError(
          (e instanceof Error ? e.message : "Confirmation unavailable.") +
            " Use Check transfer status; do not start another move.",
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={g.transfer}>
      <label>
        Amount to move ($)
        <input
          aria-label="Savings transfer amount"
          type="number"
          min="1"
          max={max}
          step="1"
          value={amount}
          placeholder={String(max)}
          disabled={busy || d.loading || !!pending}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          fontWeight: 400,
        }}
      >
        <input
          type="checkbox"
          style={{ width: 16, marginTop: 3, flexShrink: 0 }}
          checked={ack}
          disabled={busy}
          onChange={(e) => setAck(e.target.checked)}
        />
        I’ve checked that enough stays in checking for my bills.
      </label>
      <Button
        onClick={() => void review()}
        disabled={
          busy ||
          d.loading ||
          !ack ||
          d.source !== "nessie" ||
          !caps?.transfersSupported ||
          caps.blocked ||
          !!pending ||
          !Number.isInteger(Number(amount)) ||
          Number(amount) < 1 ||
          Number(amount) > max
        }
      >
        {busy ? "Checking…" : "Review savings move"}
      </Button>
      <p className={g.transferLimit}>
        {d.source === "demo"
          ? "Connect accounts above to move sandbox money."
          : `Up to ${money(max)} per move, in whole dollars.`}
      </p>
      <p className={g.transferLimit}>
        Sandbox money only. The banking service verifies the receipt; OTTO updates its own
        checking and savings ledger.
      </p>
      {d.source === "nessie" && caps?.reason && (
        <p className={s.warning}>{bankDisplayText(caps.reason)}</p>
      )}
      {caps?.blocked && (
        <p className={s.warning}>
          A sandbox transfer is processing or needs review. New moves are
          paused.
        </p>
      )}
      {pending && (
        <Button variant="outline" disabled={busy} onClick={() => void status()}>
          Check transfer status
        </Button>
      )}
      {result && (
        <div
          role="status"
          className={result.status === "completed" ? s.success : s.warning}
        >
          <strong>
            {result.status === "completed"
              ? "Sandbox transfer completed"
              : result.status === "failed"
                ? "Transfer failed"
                : result.status === "review"
                  ? "Not submitted"
                  : "Transfer needs confirmation"}
            : {money(result.amount)}
          </strong>
          <p>
            {result.status === "completed"
              ? "Checking and savings were updated in OTTO’s sandbox ledger."
              : bankDisplayText(result.message || "Check status before making another move.")}
          </p>
          {result.receipt && (
            <p>
              Transfer receipt: <code>{result.receipt}</code>
            </p>
          )}
          <small style={{ display: "block" }}>
            OTTO reference: {result.id}
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {bankDisplayText(error)}
        </p>
      )}
      {storageNotice && (
        <p role="status" className={s.warning}>
          {storageNotice}
        </p>
      )}
      {d.source === "nessie" && !!caps?.recent?.length && (
        <section className={g.receipts} aria-label="Sandbox transfer receipts">
          <h3>Transfer history</h3>
          {caps.recent.map((r) => (
            <article className={g.receipt} key={r.id}>
              <div>
                <strong>{money(r.amount)} → savings</strong>
                <strong>
                  {r.status === "completed" ? "✓ Receipt verified" : r.status}
                </strong>
              </div>
              <details>
                <summary>
                  View receipt{r.balances ? " and balance changes" : ""}
                </summary>
                {r.receipt && (
                  <>
                    <p>Transfer receipt ID</p>
                    <code>{r.receipt}</code>
                  </>
                )}
                {r.verifiedAt && (
                  <p>Verified {new Date(r.verifiedAt).toLocaleString()}</p>
                )}
                {r.balances && (
                  <dl className={g.breakdown}>
                    <dt>OTTO checking</dt>
                    <dd>
                      {money(r.balances.checkingBefore)} →{" "}
                      {money(r.balances.checkingAfter)}
                    </dd>
                    <dt>OTTO savings</dt>
                    <dd>
                      {money(r.balances.savingsBefore)} →{" "}
                      {money(r.balances.savingsAfter)}
                    </dd>
                  </dl>
                )}
                <p>
                  The provider’s raw account balances do not settle. These balance
                  changes are stored in OTTO’s sandbox ledger.
                </p>
              </details>
            </article>
          ))}
        </section>
      )}
      <dialog
        ref={dialog}
        className={s.modal}
        aria-labelledby="grow-transfer-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setQuote(null);
        }}
        onClose={() => {
          if (!busy) setQuote(null);
        }}
      >
        <h2 id="grow-transfer-title">Confirm sandbox transfer</h2>
        {quote && (
          <>
            <p>
              <strong>{money(quote.amount)}</strong> from {quote.from} to{" "}
              {quote.to}.
            </p>
            <p>
              OTTO checking after the move:{" "}
              <strong>{money(quote.remaining)}</strong>. Reserved for upcoming
              costs: {money(quote.reserve)}.
            </p>
            <p>
              This creates a sandbox transfer receipt and updates OTTO’s shared
              sandbox ledger. Provider balances remain unchanged. This is not
              a real-bank transfer or investment.
            </p>
            <div className={s.actions}>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setQuote(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  busy || d.loading || quote.fingerprint !== fingerprint
                }
                onClick={() => void confirm()}
              >
                {busy ? "Verifying receipt…" : "Confirm transfer"}
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
