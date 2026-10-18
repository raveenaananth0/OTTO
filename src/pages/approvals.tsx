import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { OttoConfirm } from "../components/OttoConfirm";
import { useOttoData } from "../helpers/useOttoData";
import {
  paymentApprovals,
  approvalTotal,
  type PaymentApproval,
} from "../helpers/paymentApprovals";
import s from "../components/OttoPage.module.css";
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export default function Approvals() {
  const { state, source } = useOttoData(),
    [params] = useSearchParams(),
    [requests, setRequests] = useState(() => paymentApprovals.list()),
    [email, setEmail] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [reviewEmail, setReviewEmail] = useState<PaymentApproval | null>(() =>
      paymentApprovals.get(params.get("preview") || ""),
    ),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setSelected([]);
  }, [source]);
  const id = params.get("id"),
    token = params.get("token"),
    request = requests.find((r) => r.id === id),
    valid = request && token === request.token,
    expired = valid && Date.now() >= request.expiresAt,
    pending = valid && request.status === "pending" && !expired,
    total = state.bills
      .filter((b) => selected.includes(b.id))
      .reduce((sum, b) => sum + b.amount, 0);
  function refresh() {
    setRequests(paymentApprovals.list());
  }
  function create() {
    setError("");
    try {
      const r = paymentApprovals.create(
        email,
        state.bills
          .filter((b) => selected.includes(b.id))
          .map((b) => ({
            id: b.id,
            payee: b.payee,
            amount: b.amount,
            kind: "bill",
          })),
      );
      setReviewEmail(r);
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create the email preview.",
      );
    }
  }
  function decide(decision: "approve" | "decline") {
    setError("");
    try {
      if (!request || !token) return;
      paymentApprovals.decide(request.id, token, decision);
      refresh();
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update approval.");
      setConfirm(false);
    }
  }
  return (
    <div className={s.page}>
      <div className={s.heading}>
        <div>
          <span className={s.eyebrow}>YOU HAVE THE FINAL SAY</span>
          <h1>Nothing moves until you say yes.</h1>
        </div>
        <span className={s.badge}>
          <Mail size={13} />
          Email approval preview
        </span>
      </div>
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      {id ? (
        <section className={s.card}>
          {!valid ? (
            <div className={s.error}>
              This approval link is invalid or is not available in this browser.
            </div>
          ) : (
            <>
              <div className={s.row}>
                <h2>Review this payment request</h2>
                <span className={s.badge}>
                  {expired && request.status === "pending"
                    ? "Expired"
                    : request.status === "simulated"
                      ? "Approved · demo receipt"
                      : request.status}
                </span>
              </div>
              <p>Recipient: {request.email}</p>
              <ChargeList request={request} />
              <p className={s.sub}>
                The amount and recipients are fixed to this email request. The
                link expires after 24 hours. Opening it never authorizes a
                charge.
              </p>
              {pending && (
                <div className={s.actions}>
                  <Button variant="outline" onClick={() => decide("decline")}>
                    Decline
                  </Button>
                  <Button onClick={() => setConfirm(true)}>
                    Approve payment
                  </Button>
                </div>
              )}
              {request.status === "simulated" && (
                <div className={s.success}>
                  <CheckCircle2 size={15} /> Approval recorded once. Demo
                  receipt: {request.receiptId}. No funds moved.
                </div>
              )}
              {request.status === "declined" && (
                <div className={s.warning}>
                  Declined. Nothing was approved or charged.
                </div>
              )}
              {expired && request.status === "pending" && (
                <div className={s.error}>
                  This link has expired. No payment was made.
                </div>
              )}
            </>
          )}
          <Link className={s.link} to="/approvals">
            Back to approval outbox
          </Link>
        </section>
      ) : (
        <>
          <div className={s.two}>
            <section className={s.card}>
              <h2>1. Prepare a payment summary</h2>
              <p>
                Select{" "}
                {source === "nessie"
                  ? "bills from your connected accounts"
                  : "charges from the sample schedule"}
                . Creating this email preview does not make a payment.
              </p>
              <label className={s.field}>
                Recipient email
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <div className={s.stack + " " + s.spaced}>
                {state.bills.map((b) => (
                  <label key={b.id} className={s.row} style={{ fontSize: 13 }}>
                    <span>
                      <input
                        type="checkbox"
                        checked={selected.includes(b.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, b.id]
                              : old.filter((id) => id !== b.id),
                          )
                        }
                      />{" "}
                      {b.payee}{" "}
                      <small className={s.muted}>· day {b.dueDay}</small>
                    </span>
                    <strong>{money(b.amount)}</strong>
                  </label>
                ))}
              </div>
              <hr className={s.divider} />
              <div className={s.row}>
                <strong>Total {money(total)}</strong>
                <Button disabled={!email || !selected.length} onClick={create}>
                  Preview approval email
                </Button>
              </div>
            </section>
            <section className={s.card}>
              <ShieldCheck size={25} color="#0073aa" />
              <h2 style={{ marginTop: 15 }}>2. Review, then approve</h2>
              <p>
                The email preview lists every charge and its total. Its Approve
                payment button opens a review screen; the user confirms there.
              </p>
              <p>
                Each request has an expiring link and one demo receipt.
                Duplicate approvals reuse that receipt. Declined, invalid, or
                expired requests cannot approve a payment.
              </p>
              <p className={s.sub}>
                Live delivery needs an email provider and a server-backed
                approval record. Payment execution stays disabled until that
                integration is configured.
              </p>
            </section>
          </div>
          <section className={s.card + " " + s.spaced}>
            <h2>Approval outbox</h2>
            {requests.length === 0 ? (
              <p>
                No requests yet. Prepare an email preview above or request one
                from a committed Future You timeline.
              </p>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "15px 0",
                    borderBottom: "1px solid #e5edf2",
                  }}
                >
                  <div className={s.row}>
                    <div>
                      <h3>
                        {money(approvalTotal(r))} · {r.charges.length}{" "}
                        {r.charges.length === 1 ? "item" : "items"}
                      </h3>
                      <span className={s.sub}>
                        {r.email} ·{" "}
                        {r.status === "simulated"
                          ? "Approved · demo receipt"
                          : r.status}{" "}
                        · Email not sent
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewEmail(r)}
                    >
                      View email preview
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
      {reviewEmail && (
        <OttoConfirm
          title="Approval email preview"
          busy={false}
          onClose={() => setReviewEmail(null)}
          onConfirm={() => setReviewEmail(null)}
          label="Close preview"
        >
          <p>
            <strong>Not sent</strong> · To: {reviewEmail.email}
          </p>
          <p>
            Subject: Your approval is needed for{" "}
            {money(approvalTotal(reviewEmail))} in planned payments
          </p>
          <p>
            Hi, OTTO would like to make the following payments. Review the
            details before approving.
          </p>
          <ChargeList request={reviewEmail} />
          <Link
            className={s.link}
            to={paymentApprovals.url(reviewEmail)}
            onClick={() => setReviewEmail(null)}
          >
            Approve payment →
          </Link>
          <p>
            No payment is authorized just by opening this link. This is a local
            preview, not a delivered email.
          </p>
        </OttoConfirm>
      )}
      {confirm && valid && (
        <OttoConfirm
          title="Approve this payment?"
          busy={false}
          onClose={() => setConfirm(false)}
          onConfirm={() => decide("approve")}
          label={"Approve " + money(approvalTotal(request))}
        >
          <ChargeList request={request} />
          <p>
            This local test records your approval and generates one demo
            receipt. No funds move.
          </p>
        </OttoConfirm>
      )}
    </div>
  );
}
function ChargeList({ request }: { request: PaymentApproval }) {
  return (
    <div>
      <ul className={s.list}>
        {request.charges.map((c) => (
          <li key={c.id}>
            {c.payee} — {money(c.amount)}
          </li>
        ))}
      </ul>
      <div
        className={s.row}
        style={{
          borderTop: "1px solid #e1e9ef",
          paddingTop: 12,
          marginBottom: 18,
        }}
      >
        <strong>Total</strong>
        <strong>{money(approvalTotal(request))}</strong>
      </div>
    </div>
  );
}
