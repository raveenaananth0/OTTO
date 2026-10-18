import { defaultGrowSettings, type GrowSettings } from "./grow";
const key = (source?: "demo" | "nessie") =>
  source === "demo" ? "otto-grow-settings-demo" : "otto-grow-settings";
export function readGrowSettings(source?: "demo" | "nessie"): GrowSettings {
  try {
    const v = JSON.parse(localStorage.getItem(key(source)) || "null");
    if (!v || typeof v !== "object") return { ...defaultGrowSettings };
    return {
      nextPayday:
        typeof v.nextPayday === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.nextPayday)
          ? v.nextPayday
          : "",
      buffer:
        Number.isFinite(v.buffer) && v.buffer >= 0 && v.buffer <= 100000
          ? v.buffer
          : 200,
      emergencyMonths:
        Number.isInteger(v.emergencyMonths) &&
        v.emergencyMonths >= 1 &&
        v.emergencyMonths <= 12
          ? v.emergencyMonths
          : 3,
      apy: Number.isFinite(v.apy) && v.apy >= 0 && v.apy <= 20 ? v.apy : 4,
      investmentReturn:
        Number.isFinite(v.investmentReturn) &&
        v.investmentReturn >= -50 &&
        v.investmentReturn <= 20
          ? v.investmentReturn
          : 5,
      contribution:
        Number.isFinite(v.contribution) &&
        v.contribution >= 0 &&
        v.contribution <= 10000
          ? v.contribution
          : 100,
      cadence: v.cadence === "payday" ? "payday" : "month",
    };
  } catch {
    return { ...defaultGrowSettings };
  }
}
export function saveGrowSettings(
  settings: GrowSettings,
  source?: "demo" | "nessie",
) {
  try {
    localStorage.setItem(key(source), JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
