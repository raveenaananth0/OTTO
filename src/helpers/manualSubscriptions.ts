import { useSyncExternalStore } from "react";
import { samePayee } from "./grow";
import type { Bill, SimState } from "./simTypes";
const storageKey = "otto-manual-subscriptions";
let memory: Bill[] = [],
  loaded = false,
  failed = false,
  notice = "";
const listeners = new Set<() => void>();
export function validateSubscription(value: Bill): Bill {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.payee !== "string" ||
    !value.payee.trim() ||
    value.payee.length > 80 ||
    !Number.isFinite(value.amount) ||
    value.amount < 0.01 ||
    value.amount > 10000 ||
    Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 1e-6 ||
    !Number.isInteger(value.dueDay) ||
    value.dueDay < 1 ||
    value.dueDay > 30
  )
    throw new Error(
      "Enter a name, a cost from $0.01 to $10,000, and a billing day from 1 to 30.",
    );
  return {
    ...value,
    payee: value.payee.trim(),
    amount: Math.round(value.amount * 100) / 100,
  };
}
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(raw)) throw Error();
    const ids = new Set<string>();
    memory = raw.flatMap((v) => {
      try {
        const b = validateSubscription(v);
        if (ids.has(b.id)) throw Error();
        ids.add(b.id);
        return [b];
      } catch {
        notice =
          "Some damaged entries were skipped. Your valid entries are intact.";
        return [];
      }
    });
  } catch {
    notice = "Saved entries could not be read. You can add new entries here.";
  }
}
function save(next: Bill[]) {
  memory = next;
  loaded = true;
  if (!failed)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      failed = true;
      notice =
        "Storage is unavailable. Entries remain available across pages in this app until you close or reload this browser tab.";
    }
  listeners.forEach((fn) => fn());
}
export function manualSubscriptions() {
  load();
  return memory;
}
export function mergeManualSubscriptions(
  state: SimState,
  items = manualSubscriptions(),
): SimState {
  const planned = items.filter(
    (item) =>
      !state.bills.some((b) => samePayee(b.payee, item.payee)) &&
      !state.txns.some(
        (t) =>
          t.type === "purchase" &&
          samePayee(t.desc, item.payee) &&
          Math.abs(t.amount - item.amount) < 0.01,
      ),
  );
  return {
    ...state,
    bills: [
      ...state.bills,
      ...planned.map((i) => ({ ...i, id: "manual:" + i.id })),
    ],
  };
}
export function upsertManualSubscription(value: Bill) {
  load();
  const b = validateSubscription(value);
  if (memory.some((item) => item.id !== b.id && samePayee(item.payee, b.payee)))
    throw Error(
      "That subscription is already in your manual list. Edit the existing entry instead.",
    );
  if (memory.length >= 100 && !memory.some((item) => item.id === b.id))
    throw Error(
      "Keep up to 100 manual entries. Remove one before adding another.",
    );
  save([...memory.filter((item) => item.id !== b.id), b]);
}
export function useManualSubscriptions() {
  load();
  const items = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => memory,
    () => memory,
  );
  return {
    items,
    storageNotice: notice,
    upsert: upsertManualSubscription,
    remove(id: string) {
      save(memory.filter((i) => i.id !== id));
    },
  };
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === storageKey || e.key === null) {
      loaded = false;
      load();
      listeners.forEach((fn) => fn());
    }
  });
