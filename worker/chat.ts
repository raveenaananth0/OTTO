import superjson from "superjson";
import { LONG_MESSAGE_ERROR } from "../src/helpers/chatRequest";
import { schema } from "../src/endpoints/chat_POST.schema";
import { fakeMonth } from "../src/helpers/fakeMonth";
import { demoOttoReply } from "../src/helpers/demoOttoReply";
import { validateState } from "../src/helpers/payroll";
import { samePayee } from "../src/helpers/grow";
import type { SimState } from "../src/helpers/simTypes";
// Environment secrets are intentionally ignored: chat never calls a paid model.
export type ChatEnv = Record<string, unknown>;
const json = (value: unknown, status = 200) =>
  new Response(superjson.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const limits = new Map<string, { count: number; until: number }>();
export async function chat(
  request: Request,
  _env: ChatEnv,
  getBank: () => Promise<SimState>,
) {
  if (request.method === "GET")
    return json({ configured: false, mode: "fallback" });
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Use chat from the OTTO website." }, 403);
  if (Number(request.headers.get("content-length")) > 80000)
    return json({ error: LONG_MESSAGE_ERROR }, 413);
  let body;
  try {
    const text = await request.text();
    if (text.length > 80000) return json({ error: LONG_MESSAGE_ERROR }, 413);
    const raw = superjson.parse<any>(text);
    if (
      typeof raw?.messages?.at?.(-1)?.content === "string" &&
      raw.messages.at(-1).content.trim().length > 2000
    )
      return json({ error: LONG_MESSAGE_ERROR }, 400);
    body = schema.parse(raw);
  } catch {
    return json(
      {
        error: "Please enter a valid question.",
      },
      400,
    );
  }
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  if (limits.size > 1000)
    for (const [key, value] of limits)
      if (value.until < now) limits.delete(key);
  let limit = limits.get(ip);
  if (!limit || limit.until < now) {
    limit = { count: 0, until: now + 60000 };
    limits.set(ip, limit);
  }
  if (++limit.count > 20)
    return json(
      { error: "Please wait a minute before sending more messages." },
      429,
    );
  let state: SimState = fakeMonth,
    contextSource: "demo" | "nessie" = body.source;
  if (body.source === "nessie") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      state = await Promise.race([
        getBank(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("timeout")), 3000);
        }),
      ]);
      validateState(state);
    } catch {
      state = fakeMonth;
      contextSource = "demo";
    } finally {
      clearTimeout(timer);
    }
  }
  // User-entered planned bills supplement the bank schedule and are explicitly labeled.
  state = {
    ...state,
    bills: [
      ...state.bills,
      ...(body.plannedBills ?? []).filter(
        (b) =>
          !state.bills.some(
            (x) => x.id === b.id || samePayee(x.payee, b.payee),
          ),
      ),
    ],
  };
  const sourceNote =
    contextSource !== body.source
      ? "Bank data unavailable; using the sample month. "
      : "";
  const fallback = () =>
    sourceNote +
    demoOttoReply(
      state,
      body.level,
      body.day,
      body.messages.at(-1)!.content,
      contextSource,
      new Date().toISOString().slice(0, 10),
      body.growSettings,
    );
  const streaming = request.headers.get("Accept") === "text/event-stream";
  const reply = fallback();
  if (!streaming) return json({ reply, mode: "fallback" });
  return new Response(
    `data: ${JSON.stringify({ mode: "fallback", delta: reply })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`,
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
}
