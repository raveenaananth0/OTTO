import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingCharges } from "../helpers/upcomingCharges";
import type { SimState } from "../helpers/simTypes";

test("upcoming subscriptions cross month boundaries and include manual costs once", () => {
  const spotify = { id: "spotify", payee: "Spotify", amount: 12, dueDay: 20 };
  const state: SimState & { activeBills: SimState["bills"] } = {
    checking: 1000,
    savings: 1000,
    txns: [],
    activeBills: [spotify],
    bills: [
      spotify,
      { id: "manual:gym", payee: "Gym", amount: 29.99, dueDay: 5 },
      { id: "manual:duplicate", payee: "Spotify", amount: 12, dueDay: 20 },
      { id: "rent", payee: "Rent", amount: 900, dueDay: 1 },
    ],
  };
  assert.deepEqual(
    upcomingCharges(state, "nessie", "2026-10-25").map((b) => [
      b.payee,
      b.date,
      b.amount,
    ]),
    [
      ["Gym", "2026-11-05", 29.99],
      ["Spotify", "2026-11-20", 12],
    ],
  );
});

test("one-time bills retain their actual dates and past due charges appear today", () => {
  const state = {
    checking: 500,
    savings: 0,
    txns: [],
    bills: [{ id: "one", payee: "Netflix", amount: 15, dueDay: 4 }],
    oneTimeBillDates: { one: "2026-10-04" },
  } satisfies SimState & { oneTimeBillDates: Record<string, string> };
  assert.equal(
    upcomingCharges(state, "nessie", "2026-10-18")[0].date,
    "2026-10-18",
  );
});

test("sample mode shows the full month, and essential bills do not become subscriptions", () => {
  const state: SimState = {
    checking: 500,
    savings: 0,
    bills: [
      { id: "rent", payee: "Rent", amount: 900, dueDay: 1 },
      { id: "netflix", payee: "Netflix", amount: 15.49, dueDay: 29 },
    ],
    txns: [{ day: 15, type: "deposit", desc: "Payroll", amount: 1000 }],
  };
  assert.deepEqual(
    upcomingCharges(state, "demo").map((b) => b.payee),
    ["Netflix"],
  );
});

test("clear chat history removes persisted messages without touching other browser data", async () => {
  const data = new Map<string, string>([["otto-data-source", "nessie"]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
      },
    },
  });
  try {
    const store = await import("../lib/chatStore");
    const chat = store.createConversation();
    store.saveConversation({
      ...chat,
      messages: [
        { id: "message", role: "user", content: "Hello", createdAt: 1 },
      ],
    });
    assert.equal(store.listConversations().length, 1);
    store.clearConversations();
    assert.deepEqual(store.listConversations(), []);
    assert.equal(data.get("otto-data-source"), "nessie");
    assert.equal(data.get(store.CHAT_STORAGE_KEY), "[]");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
