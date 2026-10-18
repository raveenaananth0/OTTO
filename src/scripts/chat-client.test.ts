import { test } from "node:test";
import assert from "node:assert/strict";
import superjson from "superjson";
import { streamChat } from "../helpers/chatClient";
const body = {
  source: "demo" as const,
  level: 4 as const,
  day: 0,
  messages: [{ role: "user" as const, content: "Hello" }],
};
async function reply(response: Response) {
  const original = globalThis.fetch;
  let text = "";
  globalThis.fetch = async () => response;
  try {
    await streamChat(body, new AbortController().signal, (next) => {
      text = next;
    });
    return text;
  } finally {
    globalThis.fetch = original;
  }
}
test("client supports stream frames split across network chunks and UTF8 characters", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"delta":"Café "}\n\ndata: {"delta":"**hello**"}\n\ndata: {"done":true}\n\n',
  );
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += 3)
        c.enqueue(bytes.slice(i, i + 3));
      c.close();
    },
  });
  assert.equal(
    await reply(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    ),
    "Café **hello**",
  );
});
test("rejects malformed object replies instead of rendering them as React children", async () => {
  await assert.rejects(
    reply(new Response(superjson.stringify({ reply: { bad: true } }))),
    /Invalid chat reply/,
  );
});
test("requires an explicit completed nonempty stream", async () => {
  for (const s of [
    'data: {"delta":"partial"}\n\n',
    'data: {"done":true}\n\n',
    'data: {"delta":{}}\n\n',
  ])
    await assert.rejects(
      reply(
        new Response(s, { headers: { "Content-Type": "text/event-stream" } }),
      ),
    );
});
test("server stream errors become recoverable client errors", async () => {
  await assert.rejects(
    reply(
      new Response('data: {"error":"Try again"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      }),
    ),
    /Try again/,
  );
});
test("HTTP failures show the server message without treating it as an answer", async () => {
  await assert.rejects(
    reply(
      new Response(superjson.stringify({ error: "Please wait" }), {
        status: 429,
      }),
    ),
    /Please wait/,
  );
});
test("free assistant answers upcoming bills, payroll and budget from actual records", async () => {
  const { demoOttoReply } = await import("../helpers/demoOttoReply");
  const { fakeMonth } = await import("../helpers/fakeMonth");
  assert.match(
    demoOttoReply(fakeMonth, 4, 0, "What bills are due before payday?"),
    /Rent|rent/,
  );
  assert.match(
    demoOttoReply(fakeMonth, 4, 0, "When is my next payday?"),
    /day 15/,
  );
  assert.match(
    demoOttoReply({ ...fakeMonth, txns: [] }, 4, 0, "When is my next payday?"),
    /no upcoming payroll/,
  );
  assert.match(
    demoOttoReply(fakeMonth, 4, 0, "Help me plan my budget"),
    /Recorded payroll/,
  );
  assert.match(
    demoOttoReply(fakeMonth, 4, 0, "What subscriptions do I have?"),
    /\$12\.00/,
  );
  assert.match(
    demoOttoReply(fakeMonth, 4, 0, "Who won the World Cup?"),
    /free financial assistant/,
  );
});
test("CRLF stream boundaries split one byte at a time still deliver text before EOF", async () => {
  const original = globalThis.fetch;
  const bytes = new TextEncoder().encode(
    'data: {"delta":"first"}\r\n\r\ndata: {"delta":" second"}\r\n\r\ndata: {"done":true}\r\n\r\n',
  );
  let index = 0,
    firstAt = 0,
    text = "";
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        pull(c) {
          if (index < bytes.length) c.enqueue(bytes.slice(index, index++ + 1));
          else c.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  try {
    await streamChat(body, new AbortController().signal, (next) => {
      if (!firstAt) firstAt = index;
      text = next;
    });
    assert.equal(text, "first second");
    assert(firstAt < bytes.length);
  } finally {
    globalThis.fetch = original;
  }
});
test("oversized unfinished stream frames fail instead of growing memory indefinitely", async () => {
  await assert.rejects(
    reply(
      new Response("data: " + "x".repeat(200001), {
        headers: { "Content-Type": "text/event-stream" },
      }),
    ),
    /too long/,
  );
});
