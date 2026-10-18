import type { SimState } from "./simTypes";
import type { EngineResult } from "./runSimulation";
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export function balanceAxis(values: number[]) {
  const low = Math.min(0, ...values),
    high = Math.max(1000, ...values);
  const rough = (high - low) / 6;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= rough)! * power;
  const min = Math.floor(low / step) * step,
    max = Math.ceil(high / step) * step;
  return {
    min,
    max,
    ticks: Array.from(
      { length: Math.round((max - min) / step) + 1 },
      (_, i) => min + i * step,
    ),
  };
}
export function simulationEvents(
  state: SimState,
  result: EngineResult,
  day: number,
  level: number,
  quiet = false,
) {
  const schedule = result.billSchedule ?? state.bills;
  const held = result.decisions.some(
    (d) => d.day === day && d.action === "hold_transfer",
  );
  return [
    ...schedule
      .filter((b) => b.dueDay === day)
      .map((b) => `${b.payee} ${money(b.amount)} paid.`),
    ...state.txns
      .filter(
        (t) =>
          t.day === day &&
          t.type !== "deposit" &&
          (quiet || t.type === "transfer") &&
          !(held && t.type === "transfer" && t.amount > 500),
      )
      .map((t) =>
        t.type === "transfer" && t.amount > 500 && level <= 1
          ? `Sent ${money(t.amount)} to an unfamiliar payee. ${level === 0 ? "No agent to stop it." : "Copilot only warns; no transfer was blocked."}`
          : `${t.desc}: ${money(t.amount)} ${t.type === "transfer" ? "sent" : "spent"}.`,
      ),
  ];
}
