import { test } from "node:test";
import assert from "node:assert/strict";
import superjson from "superjson";
import { demoOttoReply, questionAmount } from "../helpers/demoOttoReply";
import { chatBudget } from "../helpers/chatBudget";
import { growAnalysis, defaultGrowSettings } from "../helpers/grow";
import { fakeMonth } from "../helpers/fakeMonth";
import { bankDisplayText } from "../helpers/bankDisplayText";
import { newestChatRequest, LONG_MESSAGE_ERROR } from "../helpers/chatRequest";
import { streamChat } from "../helpers/chatClient";
import { uniqueChatTitle } from "../lib/chatStore";
import type { SimState } from "../helpers/simTypes";
const state: SimState = {
  checking: 1020,
  savings: 100,
  bills: [{ id: "r", payee: "Rent", amount: 500, dueDay: 3 }],
  txns: [
    { day: 4, type: "purchase", amount: 50, desc: "Groceries" },
    {
      day: 14,
      type: "transfer",
      amount: 900,
      desc: "Unverified transfer",
      payeeId: "new",
    },
    { day: 15, type: "deposit", amount: 1150, desc: "Paycheck" },
  ],
};
const reply = (q: string, s = state) => demoOttoReply(s, 4, 0, q);
for (const [text, amount] of [
  ["$60", 60],
  ["60 dollars", 60],
  ["2000 dollar", 2000],
  ["$1,500", 1500],
  ["$0.99", 0.99],
  ["$60 and $20", 80],
  ["$60 and 20 dollars plus $0.99", 80.99],
] as const)
  test(`extract all prices: ${text}`, () =>
    assert.equal(questionAmount(text), amount));
test("affordability shows yes/no and leftover AFTER the purchase, excluding the held transfer", () => {
  assert.match(
    reply("Can I afford a $60 ticket?"),
    /^Yes\. After the \$60\.00 purchase, you’d have \$210\.00/,
  );
  assert.match(
    reply("Can I afford a $500 ticket?"),
    /^No\. After the \$500\.00 purchase, you’d have -\$230\.00/,
  );
  assert.match(
    reply("Can I afford 2000 dollar shoes?"),
    /^No\. After the \$2,000\.00 purchase, you’d have -\$1,730\.00/,
  );
  assert.match(
    reply("Can I buy $60 tickets and $20 food?"),
    /have \$190\.00 left/,
  );
  assert.match(reply("Can I afford $0.99?"), /have \$269\.01 left/);
  assert.equal(chatBudget(state, 1020, "demo", 0).spending, 50);
});
test("legitimate small scheduled transfers count; spending on payday itself is excluded", () => {
  const s = {
    ...state,
    txns: [
      ...state.txns,
      {
        day: 10,
        type: "transfer" as const,
        amount: 20,
        desc: "Verified small transfer",
      },
      { day: 15, type: "purchase" as const, amount: 999, desc: "After payday" },
    ],
  };
  assert.match(reply("Can I afford 60 dollars?", s), /have \$190\.00 left/);
});
test("broke questions explain the bill cluster, total, checking and paycheck timing", () => {
  for (const q of ["Why am I broke by the 20th?", "why am I always broke"]) {
    const text = reply(q, fakeMonth);
    for (const word of [
      "Rent",
      "Phone",
      "Pepco",
      "Car insurance",
      "$1,225.00",
      "$1,400.00",
      "day 15",
    ])
      assert(text.includes(word), text);
  }
});
test("top spending includes bill categories and excludes transfers", () => {
  for (const q of ["biggest expense", "where does my money go"]) {
    const text = reply(q);
    assert.match(text, /Housing: \$500\.00/);
    assert.match(text, /Groceries: \$50\.00/);
    assert(!text.includes("$900.00"));
  }
});
test("idle cash uses exactly Grow analysis with the same saved settings and dates", () => {
  const s = { ...state, checking: 5000 };
  const settings = {
    ...defaultGrowSettings,
    buffer: 333,
    nextPayday: "2026-11-01",
    emergencyMonths: 4,
  };
  for (const source of ["demo", "nessie"] as const) {
    const chosen =
      source === "demo" ? { ...settings, nextPayday: "" } : settings;
    const a = growAnalysis(s, source, chosen, "2026-10-18");
    const text = demoOttoReply(
      s,
      4,
      0,
      "idle cash",
      source,
      "2026-10-18",
      chosen,
    );
    assert(
      text.includes(
        a.idle.toLocaleString("en-US", { style: "currency", currency: "USD" }),
      ),
    );
    assert(text.includes("$333.00"));
  }
});
test("bank affordability respects a confirmed Grow payday and excludes payday bills", () => {
  const s: SimState = {
    checking: 1000,
    savings: 0,
    bills: [
      { id: "b", payee: "Before", amount: 100, dueDay: 20 },
      { id: "p", payee: "On payday", amount: 500, dueDay: 25 },
    ],
    txns: [],
  };
  const settings = {
    nextPayday: "2026-10-25",
    buffer: 200,
    emergencyMonths: 3,
  };
  const text = demoOttoReply(
    s,
    4,
    0,
    "Can I afford $60?",
    "nessie",
    "2026-10-18",
    settings,
  );
  assert.match(text, /have \$640\.00 left/);
  assert.match(text, /2026-10-25 payday/);
});
test("scam, investment, net worth and thanks have distinct answers", () => {
  for (const q of ["suspicious", "scam", "fraud", "the $900 transfer"]) {
    const text = reply(q);
    assert.match(text, /\$900\.00/);
    assert.match(text, /new or unidentified payee/);
    assert.match(text, /over \$500/);
    assert.match(text, /held/);
  }
  const invest = reply("should I invest");
  assert.match(invest, /emergency fund/i);
  assert.match(invest, /Grow/);
  assert.match(invest, /\$100\.00/);
  assert.match(reply("net worth"), /\$1,120\.00/);
  for (const q of ["thanks", "thank you", "thanks Otto"])
    assert.match(reply(q), /welcome/);
});
test("bank copy is clean and every reply has no em dashes, even in merchant descriptions", () => {
  assert(
    !demoOttoReply(state, 4, 0, "checking balance", "nessie").includes(
      "starting checking",
    ),
  );
  assert.match(
    demoOttoReply({ ...state, txns: [] }, 4, 0, "next payday", "nessie"),
    /available bank history/,
  );
  assert.equal(
    bankDisplayText("the available the banking service history"),
    "available bank history",
  );
  for (const q of [
    "broke",
    "biggest expense",
    "idle cash",
    "scam",
    "should I invest",
    "net worth",
    "thanks",
    "Can I afford $60?",
    "checking balance",
  ])
    assert(
      !reply(q, {
        ...state,
        bills: [{ ...state.bills[0], payee: "Rent — Home" }],
      }).includes("\u2014"),
    );
});
test("duplicate titles get a stable Eastern time suffix and same-minute collisions stay unique", () => {
  const time = Date.parse("2026-10-18T07:14:00Z");
  assert.equal(
    uniqueChatTitle("Ticket", [{ title: "Ticket" }], time),
    "Ticket · 3:14 AM",
  );
  assert.equal(
    uniqueChatTitle(
      "Ticket",
      [{ title: "Ticket" }, { title: "Ticket · 3:14 AM" }],
      time,
    ),
    "Ticket · 3:14 AM (2)",
  );
});
test("failed old messages are excluded before validation, but an oversized newest question gets a friendly error", () => {
  const body = {
    source: "demo" as const,
    level: 4 as const,
    day: 0,
    messages: [
      { role: "user" as const, content: "x".repeat(2001) },
      { role: "user" as const, content: "thanks" },
    ],
  };
  assert.deepEqual(newestChatRequest(body).messages, [
    { role: "user", content: "thanks" },
  ]);
  assert.throws(
    () => newestChatRequest({ ...body, messages: body.messages.slice(0, 1) }),
    { message: LONG_MESSAGE_ERROR },
  );
});
test("network payload only contains the newest question, never a prior failed message", async () => {
  const original = globalThis.fetch;
  let sent: any;
  globalThis.fetch = async (_url, init) => {
    sent = superjson.parse(String(init?.body));
    return new Response(superjson.stringify({ reply: "You’re welcome!" }));
  };
  try {
    await streamChat(
      {
        source: "demo",
        level: 4,
        day: 0,
        messages: [
          { role: "user", content: "x".repeat(2001) },
          { role: "assistant", content: "Old answer" },
          { role: "user", content: "thank you" },
        ],
      },
      new AbortController().signal,
      () => {},
    );
    assert.deepEqual(sent.messages, [{ role: "user", content: "thank you" }]);
  } finally {
    globalThis.fetch = original;
  }
});
test("saving and refreshing duplicate conversations keeps unique titles and stable suffixes", async () => {
  const storage = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  };
  const store = await import("../lib/chatStore");
  const make = () => {
    const c = store.createConversation();
    return store.saveConversation({
      ...c,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Can I afford a $60 concert ticket?",
          createdAt: Date.now(),
        },
      ],
    });
  };
  const a = make(),
    b = make(),
    c = make();
  assert.equal(new Set(store.listConversations().map((c) => c.title)).size, 3);
  assert.match(b.title, / · \d{1,2}:\d{2} [AP]M/);
  assert.match(c.title, /\(2\)$/);
  const updated = store.saveConversation({
    ...b,
    messages: [
      ...b.messages,
      {
        id: "answer",
        role: "assistant",
        content: "No.",
        createdAt: Date.now(),
      },
    ],
  });
  assert.equal(updated.title, b.title);
  assert.equal(store.getConversation(a.id)!.title, a.title);
  delete (globalThis as any).window;
});
