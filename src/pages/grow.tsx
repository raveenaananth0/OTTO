import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Sprout, Database } from "lucide-react";
import { useOttoData } from "../helpers/useOttoData";
import {
  growAnalysis,
  defaultGrowSettings,
  projection,
  periodsFor,
  type GrowSettings,
} from "../helpers/grow";
import { readGrowSettings, saveGrowSettings } from "../helpers/growStore";
import { formatMoney as money } from "../helpers/formatMoney";
import type { SimState, Bill } from "../helpers/simTypes";
import GrowTransfer from "../components/GrowTransfer";
import { Button } from "../components/Button";
import s from "../components/OttoPage.module.css";
import g from "./grow.module.css";

type BankEvidence = SimState & {
  sandboxAccounts?: { checking: string; savings: string };
  activeBills?: Bill[];
  growMoved?: number;
  reportingMonth?: string;
  observedPurchases?: number;
};
export default function Grow() {
  const d = useOttoData();
  const dateLabel = (date: string) =>
    d.source === "demo"
      ? `Day ${Math.round((Date.parse(date + "T00:00:00Z") - Date.UTC(2026, 9, 1)) / 86400000) + 1}`
      : date;
  const [settingsBySource, setSettingsBySource] = useState(() => ({
    demo: readGrowSettings("demo"),
    nessie: readGrowSettings("nessie"),
  }));
  const settings = settingsBySource[d.source];
  const [saved, setSaved] = useState("");
  let a: ReturnType<typeof growAnalysis> | undefined,
    calculationError = "";
  try {
    a = growAnalysis(d.state, d.source, settings);
  } catch (error) {
    calculationError =
      error instanceof Error ? error.message : "Check your payday and buffer.";
  }
  // Keep the safety calculation consistent when returning to Overview.
  useEffect(() => {
    if (a) saveGrowSettings(settings, d.source);
  }, [settings, d.source]);
  useEffect(() => {
    setSaved("");
  }, [d.source]);
  const bank = d.state as BankEvidence;
  const linked = d.source === "nessie" && !!bank.sandboxAccounts;
  const moved = bank.growMoved || 0;
  const periods = periodsFor(settings, d.state);
  const annual = projection(
    0,
    settings.contribution,
    periods,
    settings.investmentReturn,
    10,
  );
  const cashInterest = projection(
    a?.idle || 0,
    0,
    12,
    settings.apy,
    1,
  ).earnings;
  function update<K extends keyof GrowSettings>(
    key: K,
    value: GrowSettings[K],
  ) {
    setSettingsBySource((prev) => ({
      ...prev,
      [d.source]: { ...prev[d.source], [key]: value },
    }));
    setSaved("");
  }
  function savePlan() {
    const ok = saveGrowSettings(settings, d.source);
    try {
      localStorage.setItem(
        "otto-grow-plan",
        JSON.stringify({
          settings,
          source: d.source,
          savedAt: Date.now(),
          status: "planned",
        }),
      );
      setSaved(
        ok
          ? "Investing plan saved on this device. No investments are scheduled."
          : "Plan kept for this session; browser storage is unavailable.",
      );
    } catch {
      setSaved("Plan kept for this session; browser storage is unavailable.");
    }
  }
  return (
    <div className={s.page + " " + g.easy}>
      <div className={s.heading}>
        <div>
          <span className={s.eyebrow}>A PURPOSE FOR EVERY DOLLAR</span>
          <h1>Put spare money to work.</h1>
        </div>
      </div>
      <section className={g.connection} aria-label="Account connection">
        <div>
          <strong>
            <span className={linked ? g.connectedDot : g.sampleDot} />
            {linked
              ? "Sandbox accounts connected"
              : "You’re viewing the sample month"}
          </strong>
          <div>
            {linked
              ? "Checking + savings · Sandbox accounts"
              : "Load your connected sandbox accounts to make a savings move."}
          </div>
        </div>
        <Button
          variant="outline"
          disabled={d.loading}
          onClick={() => void (linked ? d.refresh() : d.setSource("nessie"))}
        >
          <RefreshCw size={15} />
          {d.loading
            ? "Loading…"
            : linked
              ? "Refresh accounts"
              : "Connect accounts"}
        </Button>
      </section>
      {calculationError && (
        <p className={s.error} role="alert">
          {calculationError}
        </p>
      )}
      <section className={g.summary} aria-label="Money available to move">
        <article className={g.idle}>
          <span className={s.eyebrow}>YOU COULD MOVE</span>
          <div className={g.big}>
            {d.loading ? "…" : a ? money(a.idle) : "—"}
          </div>
          <p>After keeping money for bills and everyday spending.</p>
        </article>
        <article className={s.card}>
          <h2>Needed for bills + buffer</h2>
          <div className={s.value}>{a ? money(a.reserve) : "—"}</div>
          <p>
            {a?.confirmedPayday
              ? `Costs through payday, ${dateLabel(a.through)}.`
              : "Reserved for the next 30 days."}
          </p>
        </article>
        <article className={s.card}>
          <h2>Emergency savings</h2>
          <div className={s.value}>{money(d.state.savings)}</div>
          <p>Goal: {a ? money(a.emergencyGoal) : "—"}</p>
          <div className={s.progress}>
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (d.state.savings / (a?.emergencyGoal || 1)) * 100))}%`,
              }}
            />
          </div>
        </article>
      </section>
      {a && a.reserve > d.state.checking && (
        <p className={g.important}>
          No spare cash yet. Checking is {money(a.reserve - d.state.checking)}{" "}
          short of the recorded costs and buffer.
        </p>
      )}
      {a?.historyThin && (
        <p className={g.important}>
          No everyday purchases were found in your account history. Add a buffer
          for costs OTTO cannot see before moving money.
        </p>
      )}
      <details className={g.settings}>
        <summary>Adjust my payday and safety buffer</summary>
        <div className={g.fields}>
          <label>
            Next payday
            <input
              type="date"
              aria-label="Next payday"
              value={settings.nextPayday}
              onChange={(e) => update("nextPayday", e.target.value)}
              onBlur={(e) => update("nextPayday", e.currentTarget.value)}
            />
          </label>
          <label>
            Extra money to keep ($)
            <input
              aria-label="Checking buffer"
              type="number"
              min="0"
              max="100000"
              step="25"
              value={settings.buffer}
              onChange={(e) => update("buffer", Number(e.target.value))}
            />
          </label>
          <label>
            Months of emergency savings
            <input
              type="number"
              min="1"
              max="12"
              value={settings.emergencyMonths}
              onChange={(e) =>
                update("emergencyMonths", Number(e.target.value))
              }
            />
          </label>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setSettingsBySource((prev) => ({...prev, [d.source]: {...defaultGrowSettings}}));
            setSaved("");
          }}
        >
          Reset defaults
        </Button>
      </details>
      {a && (
        <details className={g.settings}>
          <summary>Why this amount?</summary>
          <dl className={g.breakdown}>
            <dt>Checking balance</dt>
            <dd>{money(d.state.checking)}</dd>
            <dt>Upcoming bills</dt>
            <dd>− {money(a.billReserve)}</dd>
            <dt>Everyday spending</dt>
            <dd>− {money(a.everydayReserve)}</dd>
            {a.transferReserve > 0 && (
              <>
                <dt>Scheduled transfers</dt>
                <dd>− {money(a.transferReserve)}</dd>
              </>
            )}
            <dt>Extra safety buffer</dt>
            <dd>− {money(settings.buffer)}</dd>
            <dt>Available to move</dt>
            <dd>{money(a.idle)}</dd>
          </dl>
          {a.due.length > 0 && (
            <ul className={s.list}>
              {a.due.map((b) => (
                <li key={b.id + b.date}>
                  <strong>{b.payee}</strong> · {money(b.amount)} ·{" "}
                  {dateLabel(b.date)}
                </li>
              ))}
            </ul>
          )}
          <p>
            Based on recorded costs as of {dateLabel(a.asOf)}. Unrecorded costs
            and account holds can reduce what is available.
          </p>
        </details>
      )}
      <section className={g.moveCard} aria-label="Move sandbox money">
        <div className={g.stepHeading}>
          <ShieldCheck size={22} />
          <span>1 / BUILD YOUR SAFETY CUSHION</span>
        </div>
        <h2>Move spare cash to savings.</h2>
        <div className={g.accountRoute}>
          <div>
            <span>FROM</span>
            <strong>OTTO checking</strong>
            <b>{money(d.state.checking)}</b>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span>TO</span>
            <strong>Autopilot Savings</strong>
            <b>{money(d.state.savings)}</b>
          </div>
        </div>
        <GrowTransfer settings={settings} />
        <details className={g.more}>
          <summary>What could savings earn?</summary>
          <label className={g.rate}>
            Example annual savings rate (%)
            <input
              type="number"
              min="0"
              max="20"
              step="0.1"
              value={settings.apy}
              onChange={(e) =>
                update("apy", Math.max(0, Math.min(20, Number(e.target.value))))
              }
            />
          </label>
          <strong className={g.interest}>
            {money(cashInterest)} in one year
          </strong>
          <p>
            Illustration on {money(a?.idle || 0)} at {settings.apy}%. This is an
            assumed rate, not your account’s rate; Grow does not open a
            high-yield account.
          </p>
        </details>
      </section>
      <details className={g.investSection}>
        <summary>
          <Sprout size={22} />2 / Explore investing for later
        </summary>
        <p>
          First build your emergency savings. Then explore putting a set amount
          into investments each month.
        </p>
        <div className={g.fields}>
          <label>
            Amount to invest ($)
            <input
              type="number"
              min="0"
              max="10000"
              value={settings.contribution}
              onChange={(e) =>
                update(
                  "contribution",
                  Math.max(0, Math.min(10000, Number(e.target.value))),
                )
              }
            />
          </label>
          <label>
            How often
            <select
              aria-label="Contribution frequency"
              value={settings.cadence}
              onChange={(e) =>
                update("cadence", e.target.value as "month" | "payday")
              }
            >
              <option value="month">Every month</option>
              <option value="payday">Every payday</option>
            </select>
          </label>
        </div>
        <div className={g.estimate}>
          <strong>{money(annual.total)}</strong>
          <span>
            Illustrative balance in 10 years · {money(annual.contributed)}{" "}
            contributed
          </span>
        </div>
        <GrowthChart
          contribution={settings.contribution}
          periods={periods}
          apy={settings.apy}
          investmentReturn={settings.investmentReturn}
        />
        <details className={g.more}>
          <summary>Change the example return</summary>
          <label className={g.rate}>
            Assumed annual investment return (%)
            <input
              type="number"
              min="-50"
              max="20"
              step="0.5"
              value={settings.investmentReturn}
              onChange={(e) =>
                update(
                  "investmentReturn",
                  Math.max(-50, Math.min(20, Number(e.target.value))),
                )
              }
            />
          </label>
          <p>
            {settings.cadence === "payday"
              ? `Assumes ${periods / 12} paydays per month. `
              : ""}
            At −5% annually, this example would end at{" "}
            {money(projection(0, settings.contribution, periods, -5, 10).total)}
            . Investments can lose money.
          </p>
        </details>
        <p className={g.important}>
          Planning only. OTTO does not connect a brokerage or place investments.
        </p>
        <Button
          variant="outline"
          disabled={!a || d.loading || settings.contribution <= 0}
          onClick={savePlan}
        >
          Save investing plan
        </Button>
        {saved && (
          <p role="status" className={s.success}>
            {saved}
          </p>
        )}
      </details>
      {linked && (
        <details className={g.evidence}>
          <summary>
            <Database size={18} />
            Account connection details
          </summary>
          <div className={g.evidenceGrid}>
            <div>
              <strong>2 accounts</strong>
              <span>From connected accounts</span>
            </div>
            <div>
              <strong>
                {
                  (
                    bank.activeBills ||
                    d.state.bills.filter((b) => !b.id.startsWith("manual:"))
                  ).length
                }{" "}
                bills
              </strong>
              <span>Used to protect your cash</span>
            </div>
            <div>
              <strong>
                {bank.observedPurchases ??
                  d.state.txns.filter((t) => t.type === "purchase").length}{" "}
                purchases
              </strong>
              <span>Imported for {bank.reportingMonth || "this month"}</span>
            </div>
          </div>
          <dl className={g.breakdown}>
            <dt>Provider checking balance</dt>
            <dd>{money(d.state.checking + moved)}</dd>
            <dt>Provider savings balance</dt>
            <dd>{money(d.state.savings - moved)}</dd>
            <dt>Verified moves in OTTO’s ledger</dt>
            <dd>{money(moved)}</dd>
          </dl>
          <p>
            OTTO reads connected accounts, bills, purchases, and deposits. When
            you confirm a move, the server creates a sandbox transfer and reads
            its receipt before updating OTTO’s shared sandbox ledger. The
            provider’s raw balances remain separate.
          </p>
          <p>
            Checking …{bank.sandboxAccounts?.checking.slice(-6)} · Savings …
            {bank.sandboxAccounts?.savings.slice(-6)}
          </p>
        </details>
      )}
    </div>
  );
}

function GrowthChart({
  contribution,
  periods,
  apy,
  investmentReturn,
}: {
  contribution: number;
  periods: number;
  apy: number;
  investmentReturn: number;
}) {
  const years = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    bank = years.map((y) => projection(0, contribution, periods, apy, y).total),
    invest = years.map(
      (y) => projection(0, contribution, periods, investmentReturn, y).total,
    ),
    max = Math.max(1, ...bank, ...invest),
    line = (points: number[]) =>
      points.map((v, i) => `${24 + i * 34},${146 - (v / max) * 124}`).join(" ");
  return (
    <figure className={g.chart}>
      <svg
        viewBox="0 0 390 180"
        role="img"
        aria-label={`Ten-year contribution illustration. Savings ${money(bank[10])}; investments ${money(invest[10])}.`}
      >
        <line x1="24" y1="146" x2="364" y2="146" stroke="#dce5eb" />
        <polyline
          points={line(bank)}
          fill="none"
          stroke="#7f9fb4"
          strokeWidth="3"
        />
        <polyline
          points={line(invest)}
          fill="none"
          stroke="#0076a8"
          strokeWidth="3"
        />
        <text x="24" y="169">
          Today
        </text>
        <text x="320" y="169">
          10 years
        </text>
      </svg>
      <figcaption>
        <span>Savings illustration</span>
        <span>Investment illustration</span>
      </figcaption>
    </figure>
  );
}
