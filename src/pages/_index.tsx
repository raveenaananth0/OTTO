import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Activity,
  CreditCard,
  GitBranch,
  MailCheck,
  MessageCircle,
} from "lucide-react";
import { useOttoData } from "../helpers/useOttoData";
import { useWorkspace } from "../helpers/useWorkspace";
import { formatMoney as money } from "../helpers/formatMoney";
import { spendingProfile, habitItems } from "../helpers/projectFuture";
import { growAnalysis, defaultGrowSettings, projection } from "../helpers/grow";
import { readGrowSettings } from "../helpers/growStore";
import { Button } from "../components/Button";
import { NessieActivity } from "../components/NessieActivity";
import s from "../components/OttoPage.module.css";
export default function Overview() {
  const { state, source, loading, setSource } = useOttoData(),
    w = useWorkspace(),
    p = spendingProfile(state);
  const navigate = useNavigate();
  let growSettings = readGrowSettings(source),
    analysis: ReturnType<typeof growAnalysis>;
  try {
    analysis = growAnalysis(state, source, growSettings);
  } catch {
    growSettings = { ...defaultGrowSettings };
    analysis = growAnalysis(state, source, growSettings);
  }
  const idle = analysis.idle;
  const missingIncome =
    source === "nessie" && !state.txns.some((t) => t.type === "deposit");
  const interest = projection(idle, 0, 12, growSettings.apy, 1).earnings;
  const cards = [
    {
      to: "/simulation",
      icon: Activity,
      title: "Let OTTO drive",
      text: "Choose your autonomy level. Watch a month of bills, savings moves, and transfer holds.",
      cta: "Simulate a month",
    },
    {
      to: "/subscriptions",
      icon: CreditCard,
      title: "Keep what you use",
      text: "Review recurring charges, start a cancellation, and track the outcome with each provider.",
      cta: "Review subscriptions",
    },
    {
      to: "/future-you",
      icon: GitBranch,
      title: "Meet Future You",
      text: "Change a habit, fork the next ten years, and compare the possibilities.",
      cta: "Explore your future",
    },
    {
      to: "/approvals",
      icon: MailCheck,
      title: "Review upcoming charges",
      text: "Review an itemized request and approve or decline it.",
      cta: "Open approvals",
    },
    {
      to: "/chat",
      icon: MessageCircle,
      title: "Talk it through",
      text: "Ask OTTO about your bills, balances, or next purchase.",
      cta: "Chat with OTTO",
    },
  ];
  return (
    <div className={s.page}>
      <div className={s.heading}>
        <div>
          <span className={s.eyebrow}>
            A LITTLE CLARITY. A LOT MORE POSSIBILITY.
          </span>
          <h1>Your money, looking ahead.</h1>
        </div>
        <span className={s.badge}>
          {source === "nessie" ? "Bank sandbox" : "Sample month"}
        </span>
      </div>
      <section className={s.grid} aria-label="Account snapshot">
        <article className={s.card}>
          <span className={s.sub}>Checking</span>
          <div className={s.value}>{money(state.checking)}</div>
          <span className={s.sub}>
            {source === "nessie"
              ? "Available checking balance"
              : "Starting checking balance"}
          </span>
        </article>
        <article className={s.card}>
          <span className={s.sub}>Savings</span>
          <div className={s.value}>{money(state.savings)}</div>
          <span className={s.sub}>
            {source === "nessie"
              ? "Available savings balance"
              : "Starting savings balance"}
          </span>
        </article>
        <article className={s.card}>
          <span className={s.sub}>Modeled monthly room</span>
          {missingIncome ? (
            <h2>Paycheck data needed</h2>
          ) : (
            <div className={s.value}>{money(p.income - p.spending)}</div>
          )}
          <span className={s.sub}>
            {missingIncome
              ? "Connect income records to estimate your monthly room."
              : "Income less bills and purchases; internal transfers excluded"}
          </span>
        </article>
      </section>
      <section className={s.card + " " + s.spaced} aria-label="Idle cash">
        <div className={s.row}>
          <div>
            <span className={s.eyebrow}>IDLE CASH</span>
            <h2>
              {loading
                ? "Checking your cash…"
                : idle > 0
                  ? `${money(idle)} could be doing more.`
                  : `${money(0)} idle cash`}
            </h2>
            {!loading && (
              <p>
                <strong>
                  {money(analysis.billReserve)} reserved for bills{" "}
                  {analysis.confirmedPayday
                    ? "through payday"
                    : "over the next 30 days"}
                </strong>
              </p>
            )}
            <p>
              {idle > 0
                ? `After reserving upcoming costs, this cash could earn about ${money(interest)} in a year at an assumed ${growSettings.apy}% APY.`
                : `${money(analysis.everydayReserve)} for expected spending${analysis.transferReserve > 0 ? ` + ${money(analysis.transferReserve)} reserved for scheduled transfers` : ""} + ${money(growSettings.buffer)} checking buffer.`}
            </p>
          </div>
          <Link className={s.link} to="/grow">
            Explore Grow <ArrowRight size={13} />
          </Link>
        </div>
      </section>
      <NessieActivity />
      <section className={s.grid + " " + s.spaced}>
        {cards.map((c) => (
          <article className={s.card + " " + s.feature} key={c.to}>
            <c.icon size={23} />
            <h2>{c.title}</h2>
            <p>{c.text}</p>
            <Link className={s.link} to={c.to}>
              {c.cta} <ArrowRight size={13} />
            </Link>
          </article>
        ))}
      </section>
      {w.data.plan && (
        <section className={s.card + " " + s.spaced}>
          <div className={s.row}>
            <div>
              <span className={s.eyebrow}>YOUR COMMITTED TIMELINE</span>
              <h2>{w.data.plan.name}</h2>
            </div>
            <Button
              variant="outline"
              disabled={loading}
              onClick={async () => {
                if (w.data.plan && source !== w.data.plan.source)
                  await setSource(w.data.plan.source);
                navigate("/future-you");
              }}
            >
              Manage plan
            </Button>
          </div>
          <p>
            {habitItems(w.data.plan.habits).length} personal habits in your
            plan.
            {w.data.plan.habits.statement && (
              <> {w.data.plan.habits.statement}</>
            )}
          </p>
          <p className={s.sub}>
            Your plan is saved. Payments require email approval; recurring
            transfers are not scheduled.
          </p>
        </section>
      )}
    </div>
  );
}
