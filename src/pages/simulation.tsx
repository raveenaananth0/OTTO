import {
  balanceAxis,
  simulationEvents,
} from "../helpers/simulationPresentation";
import AutopilotChat from "../components/OttoChat";
import { useOttoData } from "../helpers/useOttoData";
import { Button } from "../components/Button";
import { Slider } from "../components/Slider";
import styles from "./simulation.module.css";
const cx = (names: string) =>
  names
    .split(" ")
    .map((name) => styles[name] || name)
    .join(" ");
import { useEffect, useMemo, useRef, useState } from "react";
import { runSimulation, type EngineResult } from "../helpers/runSimulation";
import type { Decision } from "../helpers/simTypes";
type Level = 0 | 1 | 2 | 3 | 4;
const money = (amount: number) =>
  amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
const levels = [
  {
    name: "Manual",
    short: "You drive",
    desc: "Watch the month unfold without intervention. Every bill and transfer goes through.",
  },
  {
    name: "Copilot",
    short: "Alerts only",
    desc: "Your agent warns and suggests. It does not move money, reschedule bills, or block transfers.",
  },
  {
    name: "Assisted",
    short: "Approve the plan",
    desc: "Your agent plans the moves. You approve every decision before it happens.",
  },
  {
    name: "Autopilot",
    short: "You set the limits",
    desc: "Routine moves happen automatically. Scam holds and moves over $500 need your approval.",
  },
  {
    name: "Full autonomy",
    short: "Let it drive",
    desc: "Your agent handles bills, savings, and suspicious transfers. You get the full picture.",
  },
];
const actionNames: Record<Decision["action"], string> = {
  move_bill: "Bill rescheduled",
  sweep_savings: "Savings on autopilot",
  rebalance: "Buffer protected",
  hold_transfer: "Suspicious transfer held",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    compass:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z",
    grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
    activity: "M3 12h4l3-8 4 16 3-8h4",
    shield: "M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Zm-4 9 3 3 5-6",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    savings: "M4 9h16v11H4V9Zm2-5h12v5H6V4Zm3 10h6m-3-3v6",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
    check: "m5 12 4 4L19 6",
    play: "m8 5 11 7-11 7V5Z",
    pause: "M8 5v14m8-14v14",
    bank: "m3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.activity} />
    </svg>
  );
}
export function BalanceChart({
  baseline,
  current,
  day,
  initial,
}: {
  baseline: EngineResult;
  current: EngineResult;
  day: number;
  initial: number;
}) {
  const values = [
    initial,
    ...baseline.dailyBalances.map((b) => b.checking),
    ...current.dailyBalances.map((b) => b.checking),
  ];
  const { min, max, ticks } = balanceAxis(values);
  const x = (d: number) => 48 + (d / 30) * 650;
  const y = (balance: number) => 20 + ((max - balance) / (max - min)) * 170;
  const points = (balances: EngineResult["dailyBalances"]) =>
    [
      [x(0), y(initial)],
      ...balances.slice(0, day).map((b) => [x(b.day), y(b.checking)]),
    ]
      .map((p) => p.join(","))
      .join(" ");
  return (
    <svg
      className={cx("balance-chart")}
      viewBox="0 0 740 230"
      role="img"
      aria-label={`Checking balance through day ${day}. Blue shows your selected level; dashed grey shows no agent.`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1="48"
            x2="698"
            y1={y(value)}
            y2={y(value)}
            stroke={value === 0 ? "#dca6a3" : "#e5edf3"}
            strokeDasharray={value === 0 ? "4 5" : undefined}
          />
          <text x="0" y={y(value) + 4} className={cx("chart-label")}>
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(value)}
          </text>
        </g>
      ))}
      <polyline
        points={points(baseline.dailyBalances)}
        fill="none"
        stroke="var(--chart-color-2)"
        strokeWidth="2"
        strokeDasharray="5 5"
      />
      <polyline
        points={points(current.dailyBalances)}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle
        cx={x(day)}
        cy={y(day ? current.dailyBalances[day - 1].checking : initial)}
        r="5"
        fill="var(--primary)"
        stroke="white"
        strokeWidth="3"
      />
      {[1, 5, 10, 15, 20, 25, 30].map((d) => (
        <text
          key={d}
          x={x(d)}
          y="220"
          textAnchor="middle"
          className={cx("chart-label")}
        >
          {d === 1 ? "Day 1" : d}
        </text>
      ))}
    </svg>
  );
}
export default function Home() {
  const { state, source, loading } = useOttoData();
  const [level, setLevel] = useState<Level>(4);
  const [day, setDay] = useState(0);
  const [running, setRunning] = useState(false);
  const [showQuiet, setShowQuiet] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const result = useMemo(() => runSimulation(state, level), [state, level]);
  const baseline = useMemo(() => runSimulation(state, 0), [state]);
  const visibleDecisions = result.decisions.filter(
    (decision) => decision.day <= day,
  );
  const visibleAlerts = (result.alerts ?? []).filter((a) => a.day <= day);
  const balance = day ? result.dailyBalances[day - 1] : state;
  const isPlaying = running && day < 30;
  const finished = day === 30;
  const saved = visibleDecisions
    .filter((d) => d.action === "sweep_savings")
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const avoided = baseline.dailyBalances
    .slice(0, day)
    .filter(
      (b, i) => b.checking < 0 && result.dailyBalances[i].checking >= 0,
    ).length;
  const overdrawnDays = result.dailyBalances
    .slice(0, day)
    .filter((balance) => balance.checking < 0).length;
  const scams = visibleDecisions.filter(
    (d) => d.action === "hold_transfer",
  ).length;
  const interventions = visibleDecisions.filter((d) => d.needsApproval).length;
  useEffect(() => {
    if (!running || day >= 30) return;
    const timer = setTimeout(() => setDay(day + 1), 550);
    return () => clearTimeout(timer);
  }, [running, day]);
  useEffect(() => {
    if (feedRef.current)
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [day]);
  useEffect(() => {
    setDay(0);
    setRunning(false);
  }, [state]);
  function start() {
    setDay(0);
    setRunning(true);
  }
  return (
    <div className={cx("simulation-page")}>
      <div className={cx("page-heading")}>
        <div>
          <div className={cx("eyebrow")}>YOUR FINANCIAL DASHBOARD</div>
          <h1>A month with OTTO.</h1>
        </div>
        <div className={cx("month-chip")}>
          <Icon name="clock" size={17} /> 30-day simulation
        </div>
      </div>

      <section className={cx("autonomy-card")} aria-labelledby="autonomy-title">
        <div className={cx("autonomy-copy")}>
          <div className={cx("section-kicker")}>01 / SET YOUR AUTONOMY</div>
          <h2 id="autonomy-title">How much should we handle?</h2>
          <p>{levels[level].desc}</p>
          <div className={cx("level-pill")}>
            <span className={cx("status-dot")} /> LEVEL {level} <span>·</span>{" "}
            {levels[level].name}
          </div>
        </div>
        <div className={cx("autonomy-controls")}>
          <div className={cx("level-labels")}>
            {levels.map((item, i) => (
              <Button
                variant="ghost"
                key={item.name}
                disabled={isPlaying || loading}
                onClick={() => {
                  setLevel(i as Level);
                  setDay(0);
                  setRunning(false);
                }}
                className={cx(
                  level === i ? "level-stop selected" : "level-stop",
                )}
                aria-label={`Level ${i}: ${item.name}`}
                aria-pressed={level === i}
              >
                <span>{i}</span>
                <small>
                  {i === 0 ? "Manual" : i === 4 ? "Full autonomy" : item.name}
                </small>
              </Button>
            ))}
          </div>
          <Slider
            className={cx("autonomy-slider")}
            min={0}
            max={4}
            step={1}
            value={[level]}
            aria-label="Autonomy level"
            disabled={isPlaying || loading}
            onValueChange={([value]) => {
              setLevel(value as Level);
              setDay(0);
              setRunning(false);
            }}
          />
          <div className={cx("slider-caption")}>
            <span>You make every call</span>
            <span>Your agent takes the wheel</span>
          </div>
        </div>
      </section>

      <div className={cx("simulation-toolbar")}>
        <span className={cx("muted")}>
          {source === "nessie" ? "Connected account data" : "Sample month"}
        </span>
        <div className={cx("simulation-buttons")}>
          {day > 0 && !finished && (
            <Button
              variant="ghost"
              className={cx("text-button")}
              disabled={loading}
              onClick={() => {
                setDay(30);
                setRunning(false);
              }}
            >
              Skip to results
            </Button>
          )}
          {day > 0 && day < 30 ? (
            <Button
              variant="ghost"
              className={cx("primary-button")}
              disabled={loading}
              onClick={() => setRunning(!running)}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={16} />
              {isPlaying ? "Pause simulation" : "Resume simulation"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className={cx("primary-button")}
              disabled={loading}
              onClick={start}
            >
              {finished ? "Simulate again" : "Simulate a month"}
              <Icon name="arrow" size={18} />
            </Button>
          )}
        </div>
      </div>

      <section
        className={cx("balance-cards")}
        aria-label="Current account balances"
      >
        <div className={cx("balance-card")}>
          <span className={cx("metric-label")}>
            Checking account <Icon name="bank" size={17} />
          </span>
          <strong className={cx(balance.checking < 0 ? "negative" : "")}>
            {money(balance.checking)}
          </strong>
          <span className={cx("metric-foot")}>
            {day === 0
              ? "Your starting balance"
              : `Balance at the end of day ${day}`}
          </span>
        </div>
        <div className={cx("balance-card")}>
          <span className={cx("metric-label")}>
            Savings account <Icon name="savings" size={17} />
          </span>
          <strong>{money(balance.savings)}</strong>
          <span className={cx("metric-foot")}>
            {saved > 0
              ? `${money(saved)} swept this month`
              : "A little room to breathe"}
          </span>
        </div>
        <div className={cx("balance-card protection-card")}>
          <span className={cx("metric-label")}>
            Money protected <Icon name="shield" size={17} />
          </span>
          <strong>
            {money(
              visibleDecisions
                .filter((d) => d.action === "hold_transfer")
                .reduce((sum, d) => sum + (d.amount || 0), 0),
            )}
          </strong>
          <span className={cx("metric-foot")}>
            {scams
              ? `${scams} suspicious transfer held`
              : level <= 1
                ? level === 1
                  ? "Alerts only; no transfers blocked"
                  : "Agent protection is off"
                : "Watching for unfamiliar payees"}
          </span>
        </div>
      </section>

      <div className={cx("detail-grid")}>
        <section
          className={cx("panel chart-panel")}
          aria-labelledby="chart-title"
        >
          <div className={cx("panel-heading")}>
            <div>
              <div className={cx("section-kicker")}>02 / WATCH IT WORK</div>
              <h2 id="chart-title">A smoother month ahead</h2>
            </div>
            <span className={cx("day-badge")}>
              Day {String(day).padStart(2, "0")} <span>/ 30</span>
            </span>
          </div>
          <div className={cx("chart-legend")}>
            <span>
              <i className={cx("green-line")} />
              Level {level} · {levels[level].name}
            </span>
            <span>
              <i className={cx("dashed-line")} />
              Baseline · No agent
            </span>
          </div>
          <BalanceChart
            baseline={baseline}
            current={result}
            day={day}
            initial={state.checking}
          />
          <div className={cx("chart-bottom")}>
            <span>
              <span className={cx("status-dot")} />{" "}
              {finished
                ? "Month complete"
                : isPlaying
                  ? "Simulation in progress"
                  : day
                    ? "Simulation paused"
                    : "Ready when you are"}
            </span>
            <span>Checking balance · USD</span>
          </div>
          <div className={cx("progress-track")}>
            <div style={{ width: `${(day / 30) * 100}%` }} />
          </div>
        </section>

        <section
          id="activity"
          className={cx("panel activity-panel")}
          aria-labelledby="activity-title"
        >
          <div className={cx("panel-heading")}>
            <div>
              <div className={cx("section-kicker")}>THE DECISION LOG</div>
              <h2 id="activity-title">
                {level <= 1
                  ? "Your month, day by day"
                  : "Your agent, in action"}
              </h2>
            </div>
            <span className={cx(isPlaying ? "live-badge" : "idle-badge")}>
              {isPlaying ? "LIVE" : finished ? "COMPLETE" : "STANDBY"}
            </span>
          </div>
          <div
            className={cx("activity-feed")}
            ref={feedRef}
            role="log"
            aria-label="Daily simulation activity"
            aria-live="polite"
          >
            {day === 0 && (
              <div className={cx("feed-empty")}>
                <span className={cx("empty-icon")}>
                  <Icon name="compass" size={32} />
                </span>
                <h3>A little foresight goes a long way.</h3>
                <p>
                  Start the month to see each decision
                  <br />
                  as your agent makes it.
                </p>
              </div>
            )}
            {day > 0 && (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={showQuiet}
                onClick={() => setShowQuiet((v) => !v)}
              >
                {showQuiet ? "Hide quiet days" : "Show quiet days"}
              </Button>
            )}
            {Array.from({ length: day }, (_, i) => i + 1).map((d) => {
              const decisions = visibleDecisions.filter(
                (item) => item.day === d,
              );
              const alerts = visibleAlerts.filter((a) => a.day === d);
              const events = simulationEvents(
                state,
                result,
                d,
                level,
                showQuiet,
              );
              const payday = state.txns.some(
                (txn) => txn.day === d && txn.type === "deposit",
              );
              const daily = result.dailyBalances[d - 1];
              if (
                !showQuiet &&
                !decisions.length &&
                !alerts.length &&
                !events.length &&
                !payday &&
                daily.checking >= 0
              )
                return null;
              return (
                <div className={cx("feed-day")} key={d}>
                  <span className={cx("feed-day-label")}>
                    DAY {String(d).padStart(2, "0")}
                  </span>
                  {alerts.map((alert, i) => (
                    <div key={`alert-${i}`} className={cx("feed-simple")}>
                      <strong>{alert.detail}</strong>
                    </div>
                  ))}
                  {events.map((event, i) => (
                    <div key={`event-${i}`} className={cx("feed-simple")}>
                      {event} End-of-day checking: {money(daily.checking)}.
                    </div>
                  ))}
                  {decisions.map((decision, index) => (
                    <div
                      key={index}
                      className={cx(
                        `feed-event ${decision.action === "hold_transfer" ? "hold-event" : ""}`,
                      )}
                    >
                      <span className={cx("event-icon")}>
                        <Icon
                          name={
                            decision.action === "hold_transfer"
                              ? "shield"
                              : decision.action === "move_bill"
                                ? "clock"
                                : "savings"
                          }
                          size={17}
                        />
                      </span>
                      <div>
                        <strong>{actionNames[decision.action]}</strong>
                        <p>{decision.detail}</p>
                        <span className={cx("event-tag")}>
                          {decision.needsApproval
                            ? "Approval simulated"
                            : "Handled automatically"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {payday && (
                    <div className={cx("feed-simple")}>
                      <span className={cx("status-dot")} />
                      Paycheck received ·{" "}
                      {money(
                        state.txns
                          .filter(
                            (txn) => txn.day === d && txn.type === "deposit",
                          )
                          .reduce((sum, txn) => sum + txn.amount, 0),
                      )}
                    </div>
                  )}
                  {daily.checking < 0 && (
                    <div className={cx("overdraft-note")}>
                      Checking overdrawn: {money(daily.checking)}
                    </div>
                  )}
                  {!decisions.length &&
                    !alerts.length &&
                    !events.length &&
                    !payday &&
                    daily.checking >= 0 && (
                      <div className={cx("feed-simple muted")}>
                        {level === 0
                          ? "Scheduled spending processed."
                          : "Spending checked. No action needed."}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section
        id="scoreboard"
        className={cx("scoreboard")}
        aria-labelledby="score-title"
      >
        <div className={cx("score-intro")}>
          <div className={cx("section-kicker")}>03 / THE BIGGER PICTURE</div>
          <h2 id="score-title">
            {level <= 1
              ? level === 1
                ? "Warnings alone do not change the outcome."
                : "Your month, without autopilot."
              : finished
                ? "Less stress. Modeled impact."
                : "Small moves. Big difference."}
          </h2>
          <p>
            {finished
              ? "Your 30-day scoreboard"
              : "Your impact, as the month unfolds"}
          </p>
        </div>
        <div className={cx("score-metrics")}>
          <div>
            <strong>{money(saved)}</strong>
            <span>Swept to savings</span>
          </div>
          <div>
            <strong>
              {level <= 1 ? overdrawnDays : avoided}
              <small> days</small>
            </strong>
            <span>
              {level <= 1 ? "Days overdrawn" : "Overdraft days avoided"}
            </span>
          </div>
          <div>
            <strong>{scams}</strong>
            <span>Scam transfers blocked</span>
          </div>
          <div>
            <strong>{interventions}</strong>
            <span>Approvals requested</span>
          </div>
        </div>
      </section>

      <AutopilotChat source={source} level={level} day={day} />
    </div>
  );
}
