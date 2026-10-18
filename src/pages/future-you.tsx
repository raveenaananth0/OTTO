import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  GitBranch,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { spendingInsights } from "../helpers/spendingInsights";
import { HabitEditor } from "../components/HabitEditor";
import { habitDraft } from "../helpers/habitDraft";
import { futureState } from "../helpers/futureState";
import { paymentApprovals } from "../helpers/paymentApprovals";
import { useNavigate } from "react-router-dom";
import { FutureChart, type ChartTimeline } from "../components/FutureChart";
import { OttoConfirm } from "../components/OttoConfirm";
import { useOttoData } from "../helpers/useOttoData";
import { useWorkspace } from "../helpers/useWorkspace";
import {
  defaultHabits,
  projectFuture,
  spendingProfile,
  type Habits,
  habitItems,
  habitTotals,
  firstSavingsAmount,
  frequencyPhrase,
  DEFAULT_TARGET_YEAR,
  PROJECTION_START_YEAR,
  MAX_TARGET_YEAR,
} from "../helpers/projectFuture";
import { formatMoney as money } from "../helpers/formatMoney";
import s from "./future-you.module.css";
import p from "../components/OttoPage.module.css";
const exactMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const colors = ["#0073aa", "#008577", "#7b61aa"];
export default function FutureYou() {
  const navigate = useNavigate();
  const d = useOttoData(),
    w = useWorkspace(),
    forecast = useMemo(
      () => futureState(d.state, d.source),
      [d.state, d.source],
    ),
    base = useMemo(() => defaultHabits(forecast), [forecast]),
    profile = useMemo(() => spendingProfile(forecast), [forecast]);
  const draftKey = d.source === "nessie" ? "nessie-planned-month-v1" : d.source;
  const [habits, setHabits] = useState<Habits>(base),
    [name, setName] = useState("Less delivery, more possibilities"),
    [selected, setSelected] = useState("baseline"),
    [tab, setTab] = useState("timeline"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<"commit" | "transfer" | null>(null),
    [editingId, setEditingId] = useState<string | null>(null),
    [yearInput, setYearInput] = useState(String(DEFAULT_TARGET_YEAR)),
    [approvalEmail, setApprovalEmail] = useState("");
  const targetYear = habits.targetYear ?? DEFAULT_TARGET_YEAR;
  const yearValid =
    /^\d{4}$/.test(yearInput) &&
    Number(yearInput) > PROJECTION_START_YEAR &&
    Number(yearInput) <= MAX_TARGET_YEAR;
  useEffect(() => {
    setYearInput(String(targetYear));
  }, [targetYear]);
  const actionLock = useRef(false);
  useEffect(() => {
    const draft = habitDraft.read(draftKey, base);
    setHabits(draft);
    setYearInput(String(draft.targetYear ?? DEFAULT_TARGET_YEAR));
    setEditingId(null);
    setSelected(
      JSON.stringify(draft) === JSON.stringify(base) ? "baseline" : "preview",
    );
  }, [base, draftKey]);
  function updateHabits(value: Habits) {
    setHabits(value);
    setSelected("preview");
    setNotice("");
    habitDraft.save(draftKey, value);
  }
  const totals = habitTotals(habits, profile.paychecks);
  const forks = w.data.forks.filter((f) => f.source === d.source),
    baseline = useMemo(
      () => projectFuture(forecast, base, targetYear),
      [forecast, base, targetYear],
    ),
    preview = useMemo(
      () => projectFuture(forecast, habits, targetYear),
      [forecast, habits, targetYear],
    ),
    changed =
      JSON.stringify({ ...habits, targetYear: undefined }) !==
      JSON.stringify(base),
    unsaved =
      (changed || targetYear !== DEFAULT_TARGET_YEAR) &&
      !forks.some((f) => JSON.stringify(f.habits) === JSON.stringify(habits)),
    branches = forks.map((f, i) => ({
      id: f.id,
      name: f.name,
      color: colors[i],
      projection: projectFuture(forecast, f.habits, targetYear),
    })),
    timelines: ChartTimeline[] = [
      {
        id: "baseline",
        name: "Keep current habits",
        color: "#92a1ab",
        projection: baseline,
      },
      ...branches,
      ...(changed
        ? [
            {
              id: "preview",
              name: "With your changes",
              color: "#0073aa",
              projection: preview,
              preview: true,
            },
          ]
        : []),
    ],
    active = timelines.find((t) => t.id === selected) || timelines[0],
    fork = forks.find((f) => f.id === active.id),
    plan = w.data.plan,
    committed = plan?.forkId === fork?.id && !!fork;
  async function act(task: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
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
      actionLock.current = false;
    }
  }
  async function saveFork() {
    await act(async () => {
      const editedId = editingId;
      const data = await w.change(
        editedId
          ? { action: "edit", id: editedId, name, habits }
          : { action: "fork", name, habits, source: d.source },
      );
      const id = editedId || data.forks.at(-1)!.id;
      setSelected(id);
      setEditingId(null);
      setNotice(
        editedId
          ? "Your timeline's habits were updated."
          : "Timeline saved. Select it to compare the projected results.",
      );
      setTab("timeline");
    });
  }
  async function commit() {
    await act(async () => {
      if (!fork) return;
      await w.change({ action: "commit", id: fork.id });
      setConfirm(null);
      setNotice(
        "Your plan is saved. Create an approval email preview before any payment. This local mode never moves funds.",
      );
    });
  }
  async function transfer() {
    await act(async () => {
      if (!fork) return;
      const amount = firstSavingsAmount(fork.habits);
      const request = paymentApprovals.create(
        approvalEmail,
        [
          {
            id: "savings-" + fork.id,
            payee: "Autopilot Savings",
            amount,
            kind: "savings",
          },
        ],
        "first:" + fork.id,
      );
      setConfirm(null);
      navigate("/approvals?preview=" + encodeURIComponent(request.id));
    });
  }
  return (
    <div className={p.page}>
      <div className={p.heading}>
        <div>
          <span className={p.eyebrow}>
            YOUR FUTURE. MORE THAN ONE POSSIBILITY.
          </span>
          <h1>Meet Future You.</h1>
        </div>
        <span className={p.badge}>
          {d.source === "nessie"
            ? "Sample spending + paychecks"
            : "Sample projection"}{" "}
          · {PROJECTION_START_YEAR} → {targetYear}
        </span>
      </div>
      <label className={s.yearField}>
        Project to year
        <Input
          type="number"
          aria-label="Projection end year"
          min={PROJECTION_START_YEAR + 1}
          max={MAX_TARGET_YEAR}
          step="1"
          value={yearInput}
          aria-invalid={!yearValid}
          aria-describedby={!yearValid ? "projection-year-error" : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            setYearInput(raw);
            const year = Number(raw);
            if (
              /^\d{4}$/.test(raw) &&
              Number.isInteger(year) &&
              year > PROJECTION_START_YEAR &&
              year <= MAX_TARGET_YEAR
            )
              updateHabits({ ...habits, targetYear: year });
          }}
        />
      </label>
      {!yearValid && (
        <p id="projection-year-error" className={p.error} role="alert">
          Choose a whole year from {PROJECTION_START_YEAR + 1} to{" "}
          {MAX_TARGET_YEAR}. The graph keeps your last valid year.
        </p>
      )}
      {(error || w.error) && !confirm && (
        <div className={p.error} role="alert">
          {error || w.error}
        </div>
      )}
      {profile.income === 0 && (
        <p className={p.warning}>
          No paycheck income was found in these records, so this forecast
          assumes $0 monthly income. Choose Sample month above to explore a
          complete month with paychecks.
        </p>
      )}
      {notice && (
        <div className={p.success} role="status">
          {notice}
        </div>
      )}
      <div className={s.mobileTabs} hidden>
        {["habits", "timeline"].map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "primary" : "outline"}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      <div className={s.layout}>
        <section
          className={s.panel + " " + (tab !== "habits" ? s.hiddenMobile : "")}
          aria-label="Change your habits"
        >
          <h2>1. Change your habits</h2>
          <p className={s.hint}>
            Edit an amount below. Your graph and {targetYear} estimate update
            immediately.
          </p>
          <div className={s.liveImpact} role="status" aria-live="polite">
            <span>With your changes in {targetYear}</span>
            <strong>{money(preview.end.netWorth)}</strong>
            <span>
              {Math.abs(preview.end.netWorth - baseline.end.netWorth) < 0.01
                ? "Same as your current habits"
                : `${money(Math.abs(preview.end.netWorth - baseline.end.netWorth))} ${preview.end.netWorth >= baseline.end.netWorth ? "more" : "less"} than your current habits`}
            </span>
          </div>
          <a className={s.jumpToChart} href="#future-chart">
            See updated graph ↓
          </a>
          {editingId && <p className={p.badge}>Editing a saved timeline</p>}
          <details className={p.spaced}>
            <summary>
              Sample spending · Coffee {exactMoney(profile.coffee)}/month
            </summary>
            <p>
              This projection groups the sample purchases into categories.
              Coffee: <strong>{exactMoney(profile.coffee)}</strong>/month.
              Delivery: <strong>{exactMoney(profile.delivery)}</strong>/month.
              Edit the habits below to explore a different budget.
            </p>
            {spendingInsights(forecast)
              .filter((i) => i.count)
              .map((i) => (
                <p key={i.category}>
                  <strong>
                    {i.category}: {exactMoney(i.amount)}
                  </strong>{" "}
                  · {i.count} purchases
                </p>
              ))}
            <p>
              Merchant and keyword matching; not ML. Unrecognized purchases stay
              in Other. Refresh bank data to check for new purchases.
            </p>
          </details>
          <HabitEditor
            value={habits}
            paychecks={profile.paychecks}
            onChange={updateHabits}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              updateHabits({ ...base, targetYear });
              setYearInput(String(targetYear));
              setEditingId(null);
            }}
          >
            Reset to imported habits
          </Button>
          <div className={s.budget}>
            Monthly room after spending:{" "}
            <strong>{money(preview.surplus)}</strong>
            <br />
            Savings + investing goals:{" "}
            <strong>{money(totals.investment + totals.saving)}</strong>
          </div>
          {!preview.feasible && (
            <div className={p.warning}>
              This plan needs more cash than the month provides. The graph only
              contributes available money. Lower your goals or spending before
              committing.
            </div>
          )}
          <label className={p.field + " " + s.name}>
            Plan name
            <Input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="My next chapter"
            />
          </label>
          <Button
            style={{ width: "100%" }}
            onClick={() => void saveFork()}
            disabled={
              (!editingId && !unsaved) ||
              habitItems(habits).some((item) => !item.label.trim()) ||
              !name.trim() ||
              (!editingId && forks.length >= 3) ||
              w.loading ||
              busy ||
              !yearValid ||
              d.loading
            }
          >
            <GitBranch size={14} />{" "}
            {editingId ? "Save habit changes" : "Save this plan"}
          </Button>
          {!editingId && forks.length >= 3 && (
            <p className={p.warning}>
              All three comparison slots are in use. Select a saved timeline and
              choose Edit habits, or remove an unused timeline before saving
              another.
            </p>
          )}
          <p className={s.hint}>
            {forks.length}/3 saved plans for this data source. You can compare
            an ambitious plan even if it cannot yet be committed.
          </p>
        </section>
        <section
          id="future-chart"
          className={s.panel + " " + (tab !== "timeline" ? s.hiddenMobile : "")}
          aria-label="Timeline comparison"
        >
          <div className={p.row}>
            <h2>2. See what changes by {targetYear}</h2>
          </div>
          <p className={s.selectedName}>
            This shows your total money through {targetYear}: checking + savings
            + investments. Higher means more money.
          </p>
          {active.id !== "baseline" && (
            <div className={s.comparison}>
              <div>
                <span>{active.name}</span>
                <strong>{money(active.projection.end.netWorth)}</strong>
              </div>
            </div>
          )}
          <FutureChart
            timelines={timelines}
            selected={active.id}
            onSelect={(id) => {
              setSelected(id);
            }}
          />
          <div className={s.legend}>
            {timelines.map((t) => (
              <Button
                variant={active.id === t.id ? "outline" : "ghost"}
                key={t.id}
                onClick={() => {
                  setSelected(t.id);
                }}
                aria-pressed={active.id === t.id}
              >
                <span className={s.dot} style={{ background: t.color }} />
                {t.name}
              </Button>
            ))}
            {changed && (
              <p className={s.hint}>
                Gray = current habits. Dotted blue = your live changes. Saving
                keeps a plan so you can compare it later.
              </p>
            )}
          </div>
          <hr className={p.divider} />
          <span className={p.eyebrow}>YOUR {targetYear} SNAPSHOT</span>
          <div className={s.snapshot}>
            <div>
              Net worth<strong>{money(active.projection.end.netWorth)}</strong>
            </div>
            <div>
              Savings<strong>{money(active.projection.end.savings)}</strong>
            </div>
            <div>
              Investments
              <strong>{money(active.projection.end.investments)}</strong>
            </div>
          </div>
          {active.projection.milestones.map((m) => (
            <div className={s.milestone} key={m.label}>
              {m.hit ? (
                <CheckCircle2 size={15} color="#008577" />
              ) : (
                <Circle size={15} />
              )}{" "}
              {m.label} · {m.hit ? "hit" : "not yet"}
            </div>
          ))}
          {fork ? (
            <>
              <div className={s.branchActions}>
                <Button
                  variant="outline"
                  disabled={busy || committed}
                  onClick={() => {
                    updateHabits(fork.habits);
                    setName(fork.name);
                    setEditingId(fork.id);
                    setTab("habits");
                  }}
                >
                  Edit habits
                </Button>
                <Button
                  disabled={!active.projection.feasible || busy || w.loading}
                  onClick={() => setConfirm("commit")}
                >
                  <ArrowRight size={15} />
                  {committed ? "Review my timeline" : "Make this my timeline"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={"Delete " + fork.name}
                  disabled={busy || committed}
                  onClick={() =>
                    void act(async () => {
                      await w.change({ action: "remove", id: fork.id });
                      setSelected("baseline");
                    })
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </div>
              {committed && (
                <div className={p.success}>
                  <strong>Your plan starts here.</strong>
                  <ul className={p.list}>
                    {habitItems(plan!.habits).map((item) => (
                      <li key={item.id}>
                        {item.label}: {exactMoney(item.amount)}{" "}
                        {frequencyPhrase(item.frequency)} · {item.kind}
                      </li>
                    ))}
                  </ul>
                  No recurring payments are scheduled. Payment approval is
                  required before execution; this preview only produces demo
                  receipts.
                  <div className={s.branchActions}>
                    {firstSavingsAmount(plan!.habits) > 0 && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirm("transfer")}
                      >
                        Preview savings approval email
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await w.change({ action: "pause" });
                          setNotice(
                            "Plan paused. No new transfers are authorized.",
                          );
                        })
                      }
                    >
                      Pause plan
                    </Button>
                  </div>
                  {d.source === "demo" && (
                    <p>Scripted mode does not execute transfers.</p>
                  )}
                </div>
              )}
              {committed &&
                !plan!.habits.items &&
                profile.delivery >= plan!.habits.delivery * 0.8 && (
                  <div className={p.warning}>
                    Delivery check-in: this scripted month shows{" "}
                    {money(profile.delivery)} against your{" "}
                    {money(plan!.habits.delivery)} budget. OTTO warns here; it
                    does not block card purchases.
                  </div>
                )}
            </>
          ) : (
            <p className={s.hint}>
              Your changes are a preview, not a payment. Save this plan when you
              want to keep it.
            </p>
          )}
        </section>
      </div>
      <details className={s.assumptions}>
        <summary>Illustrative projection · View assumptions</summary>
        <p>
          Model assumptions: repeat this month's bills, purchases, and paychecks
          for {(targetYear - PROJECTION_START_YEAR) * 12} months; income and
          costs grow 2% annually; savings earn an assumed 3% and investments 6%,
          compounded monthly. Checking earns 0%. Daily habits use 365 days per
          year, weekly habits use 52 weeks per year, and yearly amounts are
          spread across 12 months. Contributions use available cash above $200.
          Starting investments and unprovided debts are $0. Taxes, fees, market
          variation, and life changes are excluded. These are illustrations, not
          forecasts or guaranteed returns.{" "}
          {d.source === "nessie"
            ? "Starting balances use OTTO’s connected-account sandbox ledger, and bills come from your connected accounts. Purchases and paychecks use the fictional sample month instead of bank transaction history. Sample bills and the sample scam transfer are excluded. These projection inputs never change your connected accounts."
            : "All inputs use the scripted month."}
        </p>
      </details>
      {confirm === "commit" && fork && (
        <OttoConfirm
          title="Make this your timeline?"
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void commit()}
          label="Commit this plan"
        >
          {(error || w.error) && (
            <p role="alert" className={p.error}>
              {error || w.error}
            </p>
          )}
          <p>
            <strong>{fork.name}</strong>
          </p>
          <ul className={p.list}>
            {habitItems(fork.habits).map((item) => (
              <li key={item.id}>
                {item.label}: {exactMoney(item.amount)}{" "}
                {frequencyPhrase(item.frequency)} · {item.kind}
              </li>
            ))}
          </ul>
          <p>
            This saves your plan. No recurring transfer is scheduled. You can
            prepare an approval email preview afterward. No payment occurs
            before approval, and this local mode never moves funds.
          </p>
        </OttoConfirm>
      )}
      {confirm === "transfer" && fork && (
        <OttoConfirm
          title="Prepare a savings approval email"
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void transfer()}
          label="Create email preview"
        >
          {(error || w.error) && (
            <p role="alert" className={p.error}>
              {error || w.error}
            </p>
          )}
          <p>
            Ask for approval to move{" "}
            <strong>{exactMoney(firstSavingsAmount(fork.habits))}</strong> from
            checking to Autopilot Savings, once.
          </p>
          <label className={p.field}>
            Recipient email
            <Input
              type="email"
              value={approvalEmail}
              onChange={(e) => setApprovalEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <p>
            The email preview includes the amount and an Approve payment link.
            It is not sent, and confirming it creates only a demo receipt. No
            sandbox or real funds move.
          </p>
        </OttoConfirm>
      )}
    </div>
  );
}
