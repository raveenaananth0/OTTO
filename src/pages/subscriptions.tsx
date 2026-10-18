import ManualSubscriptions from "../components/ManualSubscriptions";
import { useState, useRef } from "react";
import { CreditCard, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "../components/Button";
import { useOttoData } from "../helpers/useOttoData";
import { useWorkspace } from "../helpers/useWorkspace";
import { subscriptionProvider } from "../helpers/subscriptions";
import { formatMoney as money } from "../helpers/formatMoney";
import { upcomingCharges } from "../helpers/upcomingCharges";
import s from "../components/OttoPage.module.css";
export default function Subscriptions() {
  const d = useOttoData(),
    w = useWorkspace(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    lock = useRef(false);
  const upcoming = upcomingCharges(d.state, d.source);
  const subscriptions = d.state.bills.filter((b) => subscriptionProvider(b)),
    total = d.state.bills
      .filter((b) => subscriptionProvider(b) || b.id.startsWith("manual:"))
      .reduce((sum, b) => sum + b.amount, 0),
    key = (id: string) => d.source + ":" + id;
  async function act(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this request.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className={s.page}>
      <div className={s.heading}>
        <div>
          <span className={s.eyebrow}>LESS NOISE ON YOUR STATEMENT</span>
          <h1>Keep what you use.</h1>
        </div>
        <CreditCard size={30} color="#0073aa" />
      </div>
      <ManualSubscriptions />
      <div className={s.two}>
        <article className={s.card}>
          <span className={s.sub}>Recurring services / month</span>
          <div className={s.value}>{money(total)}</div>
          <p>
            {subscriptions.length} recognized recurring{" "}
            {subscriptions.length === 1 ? "service" : "services"} in the current
            bill schedule
          </p>
        </article>
        <article className={s.card}>
          <h2>Upcoming charges</h2>
          <span className={s.badge}>
            {d.source === "nessie" ? "From connected accounts" : "From sample bills"}
          </span>
          <p>
            Subscriptions scheduled over the next 30 days, including your manual
            entries.
          </p>
          {upcoming.length === 0 ? (
            <p>No upcoming subscription charges in the current schedule.</p>
          ) : (
            <ul
              aria-label="Upcoming subscription charges"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {upcoming.map((bill) => (
                <li
                  key={bill.id + bill.date}
                  className={s.row}
                  style={{ padding: "10px 0", borderTop: "1px solid #dce5eb" }}
                >
                  <div>
                    <strong>{bill.payee}</strong>
                    <div className={s.sub}>
                      {d.source === "demo"
                        ? `Day ${bill.dueDay} · sample month`
                        : new Date(bill.date + "T00:00:00Z").toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", timeZone: "UTC" },
                          )}
                      {bill.id.startsWith("manual:")
                        ? " · Added by you"
                        : d.source === "nessie"
                          ? " · Connected bill"
                          : ""}
                    </div>
                  </div>
                  <strong>{money(bill.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      {(error || w.error) && (
        <div className={s.error} role="alert">
          {error || w.error}
        </div>
      )}
      {notice && (
        <div className={s.success} role="status">
          {notice}
        </div>
      )}
      <section
        className={s.stack + " " + s.spaced}
        aria-label="Recurring subscriptions"
      >
        {subscriptions.length === 0 && (
          <div className={s.card + " " + s.empty}>
            No recognized subscription bills are currently active. Add a manual
            entry above.
          </div>
        )}
        {subscriptions.map((b) => {
          const provider = subscriptionProvider(b)!,
            status = w.data.subscriptionRequests[key(b.id)];
          return (
            <article className={s.card} key={b.id}>
              <div className={s.row}>
                <div className={s.row}>
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      background: provider.color,
                      color: "white",
                      width: 42,
                      height: 42,
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 22,
                    }}
                  >
                    {provider.monogram}
                  </span>
                  <div>
                    <h2 style={{ marginBottom: 4 }}>{b.payee}</h2>
                    <span className={s.sub}>
                      Scheduled day {b.dueDay} · {money(b.amount)}/month
                    </span>
                  </div>
                </div>
                <span className={s.badge}>
                  {status === "merchant-confirmed"
                    ? "You marked merchant canceled"
                    : status === "requested"
                      ? "Cancellation started"
                      : b.id.startsWith("manual:")
                        ? "Planned cost · added by you"
                        : "Active scheduled bill"}
                </span>
              </div>
              <hr className={s.divider} />
              <div className={s.two}>
                <div>
                  <h3>1. Cancel with the provider</h3>
                  <p>
                    Use the provider's account page. OTTO cannot cancel a
                    merchant contract or access your card.
                  </p>
                  <a
                    className={s.link}
                    href={provider.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open {provider.name} cancellation <ExternalLink size={12} />
                  </a>
                  <div
                    className={s.actions}
                    style={{ justifyContent: "flex-start" }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy || w.loading || status === "merchant-confirmed"
                      }
                      onClick={() =>
                        void act(async () => {
                          await w.change({
                            action: "subscription",
                            id: key(b.id),
                            status: "requested",
                          });
                          setNotice(
                            "Request tracked. Finish the cancellation with " +
                              provider.name +
                              ".",
                          );
                        })
                      }
                    >
                      Track cancellation
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        busy || w.loading || status === "merchant-confirmed"
                      }
                      onClick={() =>
                        void act(async () => {
                          await w.change({
                            action: "subscription",
                            id: key(b.id),
                            status: "merchant-confirmed",
                          });
                          setNotice(
                            "Marked as canceled based on your confirmation. OTTO has not verified this with the provider.",
                          );
                        })
                      }
                    >
                      <CheckCircle2 size={13} /> I canceled with provider
                    </Button>
                    {status && status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || w.loading}
                        onClick={() =>
                          void act(async () => {
                            await w.change({
                              action: "subscription",
                              id: key(b.id),
                              status: "dismissed",
                            });
                            setNotice(
                              "Tracking reset. Your bank bill and merchant subscription are unchanged.",
                            );
                          })
                        }
                      >
                        Reset tracking
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <h3>2. Review the sandbox payment</h3>
                  <p>
                    Payment execution is not connected. Use the provider link to
                    cancel {provider.name}, then update your tracker.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Payment execution is not connected"
                  >
                    Payment execution not connected
                  </Button>
                  {d.source === "demo" && (
                    <p className={s.sub}>
                      You can track cancellation and open the provider’s account
                      page.
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <p className={s.sub + " " + s.spaced}>
        Rent, utilities, insurance, and other essential bills are excluded from
        subscription cancellation. OTTO recognizes supported providers by bill
        payee names. This is description matching, not ML or automatic card
        enrollment.
      </p>
    </div>
  );
}
