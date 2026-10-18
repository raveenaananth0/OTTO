import { useEffect, useState } from "react";
import { useOttoData } from "../helpers/useOttoData";
import { growAnalysis, defaultGrowSettings } from "../helpers/grow";
import { formatMoney as money } from "../helpers/formatMoney";
import { Button } from "./Button";
import s from "./OttoPage.module.css";
import n from "./NessieActivity.module.css";

export function NessieActivity() {
  const d = useOttoData();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [d.source]);
  const transactions = d.state.txns
    .filter((t) => t.type !== "transfer")
    .slice()
    .sort((a, b) => b.day - a.day);
  const bills =
    d.source === "nessie"
      ? growAnalysis(d.state, "nessie", defaultGrowSettings).due.filter(
          (b) => !b.id.startsWith("manual:"),
        )
      : [...d.state.bills]
          .sort((a, b) => a.dueDay - b.dueDay)
          .map((b) => ({
            ...b,
            date: `2026-10-${String(b.dueDay).padStart(2, "0")}`,
          }));
  const month = (d.state as { reportingMonth?: string }).reportingMonth;
  return (
    <section className={s.card + " " + s.spaced} aria-label="Banking activity">
      <div className={s.row}>
        <h2>Your banking activity</h2>
      </div>
      <div className={n.columns}>
        <div>
          <h3>
            {d.source === "nessie"
              ? "Recent purchases & deposits"
              : "Sample purchases & paychecks"}
          </h3>
          {transactions.length ? (
            <ul>
              {(showAll ? transactions : transactions.slice(0, 5)).map(
                (t, i) => (
                  <li key={i}>
                    <div>
                      <strong>{t.desc}</strong>
                      <span>
                        Day {t.day}
                        {month ? ` · ${month}` : ""}
                      </span>
                    </div>
                    <b>
                      {t.type === "deposit" ? "+" : "−"}
                      {money(t.amount)}
                    </b>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p>
              No purchases or deposits recorded this month. Balances and bills
              are connected.
            </p>
          )}
          {transactions.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? "Show recent activity"
                : `See all ${transactions.length} transactions`}
            </Button>
          )}
        </div>
        <div>
          <h3>
            {d.source === "nessie"
              ? "Upcoming bank bills"
              : "Sample month bills"}
          </h3>
          {bills.length ? (
            <ul>
              {bills.map((b) => (
                <li key={b.id + b.date}>
                  <div>
                    <strong>{b.payee}</strong>
                    <span>
                      {d.source === "demo"
                        ? `Day ${b.dueDay}`
                        : new Date(b.date + "T00:00:00Z").toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", timeZone: "UTC" },
                          )}
                    </span>
                  </div>
                  <b>{money(b.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>No bank bills due in the next 30 days.</p>
          )}
        </div>
      </div>
    </section>
  );
}
