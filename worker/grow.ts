import { z } from "zod";
import {
  growAnalysis,
  defaultGrowSettings,
  cents,
  samePayee,
} from "../src/helpers/grow";
import type { Bill } from "../src/helpers/simTypes";
import { growBank, Rejected, type GrowBank } from "./growBank";
import {
  withGrowBalances,
  getOperation,
  publicOperation,
  finish,
  type Database,
  type Operation,
} from "./growLedger";
const settings = z
  .object({
    nextPayday: z
      .string()
      .max(10)
      .refine((v) => {
        if (!v) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const day = new Date(v + "T00:00:00Z"),
          now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        const days = (day.getTime() - now.getTime()) / 86400000;
        return (
          Number.isFinite(days) &&
          day.toISOString().slice(0, 10) === v &&
          days >= 1 &&
          days <= 45
        );
      }),
    buffer: z.number().min(0).max(100000),
    emergencyMonths: z.number().int().min(1).max(12),
  })
  .strict();
const bill = z
  .object({
    id: z.string().min(1).max(100),
    payee: z.string().min(1).max(80),
    amount: z.number().min(0).max(10000),
    dueDay: z.number().int().min(1).max(30),
  })
  .strict();
const schema = z.union([
  z
    .object({
      action: z.literal("preview"),
      amount: z.number().int().min(1).max(1000),
      settings,
      manualBills: z
        .array(bill)
        .max(50)
        .refine(
          (items) => new Set(items.map((b) => b.id)).size === items.length,
        )
        .default([]),
      acknowledgeEstimate: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.enum(["confirm", "status"]),
      id: z.string().uuid(),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
type Payload = {
  settings: z.infer<typeof settings>;
  manualBills: Bill[];
  rawChecking: number;
  rawSavings: number;
  checking: number;
  savings: number;
  reserve: number;
  from: string;
  to: string;
  expires: number;
  date: string;
  memo: string;
};
export type GrowEnv = { NESSIE_KEY?: string; DB?: Database };
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const limits = new Map<string, { n: number; until: number }>();
async function sign(id: string, key: string) {
  const secret = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        secret,
        new TextEncoder().encode("otto-grow-v1:" + id),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function check(
  db: Database,
  bank: GrowBank,
  config: Payload["settings"],
  manual: Bill[],
) {
  const snap = await bank.snapshot();
  const state = await withGrowBalances(snap.state, db);
  for (const b of manual)
    if (!state.bills.some((x) => samePayee(x.payee, b.payee)))
      state.bills.push({ ...b, id: "grow:" + b.id });
  const analysis = growAnalysis(state, "nessie", {
    ...defaultGrowSettings,
    ...config,
  });
  return {
    ...snap,
    state,
    analysis,
    rawChecking: snap.state.checking,
    rawSavings: snap.state.savings,
  };
}
async function reconcile(db: Database, bank: GrowBank, op: Operation) {
  if (!op.receipt) return op;
  const p = JSON.parse(op.payload) as Payload;
  try {
    const r = await bank.receipt(op.receipt);
    const id = r?.id ?? r?._id;
    if (
      id !== op.receipt ||
      !Number.isSafeInteger(r.amount) ||
      r.amount * 100 !== op.amount ||
      r.description !== p.memo ||
      r.transaction_date !== p.date
    )
      throw Error("Receipt details do not match the approved move.");
    if (r.status === "completed") {
      const native = await bank.balances(p.from, p.to);
      if (native.checking !== p.rawChecking || native.savings !== p.rawSavings)
        throw Error(
          "Native balances changed; manual reconciliation is required.",
        );
      await finish(db, op, "completed");
    } else if (["cancelled", "rejected", "failed"].includes(r.status))
      await finish(db, op, "failed", "Nessie did not complete this transfer.");
    else
      await db
        .prepare(
          "UPDATE grow_operations SET phase='pending', error=?, updated=? WHERE id=? AND phase<>'completed'",
        )
        .bind(
          "Nessie has not marked this receipt completed. No ledger move has been applied.",
          Date.now(),
          op.id,
        )
        .run();
  } catch {
    await db
      .prepare(
        "UPDATE grow_operations SET phase='uncertain',error=?,updated=? WHERE id=? AND phase<>'completed'",
      )
      .bind(
        "Receipt not verified. Check again; no additional transfer will be sent.",
        Date.now(),
        op.id,
      )
      .run();
  }
  return (await getOperation(db, op.id))!;
}
export async function grow(
  request: Request,
  env: GrowEnv,
  invalidate: () => void = () => {},
  injected?: GrowBank,
  waitUntil?: (p: Promise<unknown>) => void,
) {
  const db = env.DB,
    key = env.NESSIE_KEY;
  if (request.method === "GET") {
    if (!db || !key)
      return json({
        transfersSupported: false,
        reason: "The sandbox transfer ledger is not configured.",
      });
    try {
      const recent = await db
        .prepare(
          "SELECT * FROM grow_operations WHERE phase<>'review' ORDER BY created DESC LIMIT 10",
        )
        .all<Operation>();
      const lock = await db
        .prepare("SELECT operation FROM grow_locks WHERE pair='otto'")
        .first<{ operation: string }>();
      return json({
        transfersSupported: true,
        accounting: "Nessie receipts + OTTO sandbox ledger",
        blocked: !!lock,
        recent: recent.results.map(publicOperation),
      });
    } catch {
      return json(
        { error: "Transfer storage is unavailable. No move can be submitted." },
        503,
      );
    }
  }
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return json({ error: "Use Grow from the OTTO website." }, 403);
  if (!db || !key)
    return json(
      { error: "The sandbox transfer ledger is not configured." },
      503,
    );
  const now = Date.now(),
    ip = request.headers.get("CF-Connecting-IP") || "local";
  for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const limit = limits.get(ip) || { n: 0, until: now + 60000 };
  limits.set(ip, limit);
  if (++limit.n > 60)
    return json(
      { error: "Please wait a minute before checking more transfers." },
      429,
    );
  let body: z.infer<typeof schema>;
  try {
    if (Number(request.headers.get("content-length")) > 20000)
      return json({ error: "Request too large." }, 413);
    const reader = request.body?.getReader();
    let length = 0,
      parts: Uint8Array[] = [];
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 20000) {
          await reader.cancel();
          return json({ error: "Request too large." }, 413);
        }
        parts.push(value);
      }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const raw = new TextDecoder().decode(bytes);
    if (raw.length > 20000) return json({ error: "Request too large." }, 413);
    body = schema.parse(JSON.parse(raw));
  } catch {
    return json(
      {
        error:
          "Use whole dollars from $1 to $1,000 and valid cash-check settings.",
      },
      400,
    );
  }
  const bank = injected || growBank(key);
  try {
    if (body.action === "preview") {
      if (
        await db
          .prepare("SELECT operation FROM grow_locks WHERE pair='otto'")
          .first()
      )
        return json(
          {
            error:
              "Another sandbox transfer is processing or needs review. No new move can start.",
          },
          409,
        );
      const snap = await check(db, bank, body.settings, body.manualBills);
      const max = Math.min(1000, Math.floor(snap.analysis.idle));
      if (body.amount > max)
        return json(
          { error: `Available to move: $${max}. Refresh your cash check.` },
          409,
        );
      const id = crypto.randomUUID(),
        p: Payload = {
          rawChecking: snap.rawChecking,
          rawSavings: snap.rawSavings,
          settings: body.settings,
          manualBills: body.manualBills,
          checking: snap.state.checking,
          savings: snap.state.savings,
          reserve: snap.analysis.reserve,
          from: snap.from,
          to: snap.to,
          expires: now + 120000,
          date: new Date().toISOString().slice(0, 10),
          memo: `OTTO Grow ${id} | ${snap.from} -> ${snap.to}`,
        };
      await db
        .prepare(
          "INSERT INTO grow_operations(id,phase,amount,payload,created,updated) VALUES(?,'review',?,?,?,?)",
        )
        .bind(id, cents(body.amount), JSON.stringify(p), now, now)
        .run();
      return json({
        id,
        token: await sign(id, key),
        amount: body.amount,
        from: "OTTO checking",
        to: "Autopilot Savings",
        reserve: p.reserve,
        remaining: p.checking - body.amount,
        expires: p.expires,
      });
    }
    if (!equal(body.token, await sign(body.id, key)))
      return json({ error: "Invalid transfer review." }, 403);
    let op = await getOperation(db, body.id);
    if (!op) return json({ error: "Transfer review not found." }, 404);
    if (op.phase === "completed" || op.phase === "failed")
      return json(publicOperation(op));
    if (body.action === "status") {
      if (op.phase === "review") {
        const held = await db
          .prepare("SELECT operation FROM grow_locks WHERE pair='otto'")
          .first<{ operation: string }>();
        if (held?.operation === op.id) {
          if (now - op.updated < 120000)
            return json({ ...publicOperation(op), status: "submitting" });
          await finish(
            db,
            op,
            "failed",
            "The review did not reach submission. Create a fresh review.",
          );
          return json(publicOperation((await getOperation(db, op.id))!));
        }
      }
      if (op.receipt) {
        op = await reconcile(db, bank, op);
        if (op.phase === "completed") invalidate();
      } else if (op.phase === "submitting" && now - op.updated > 120000) {
        await db
          .prepare(
            "UPDATE grow_operations SET phase='uncertain',error=? WHERE id=? AND phase='submitting'",
          )
          .bind(
            "Nessie outcome is unknown. No automatic retry or additional move is allowed.",
            op.id,
          )
          .run();
        op = (await getOperation(db, op.id))!;
      }
      return json(publicOperation(op));
    }
    if (op.phase !== "review") return json(publicOperation(op));
    const p = JSON.parse(op.payload) as Payload;
    if (p.expires < now)
      return json(
        { error: "This review expired. Review the amount again." },
        409,
      );
    const locked = await db
      .prepare(
        "INSERT INTO grow_locks(pair,operation) VALUES('otto',?) ON CONFLICT(pair) DO NOTHING",
      )
      .bind(op.id)
      .run();
    if (!locked.meta.changes) {
      const current = await getOperation(db, op.id);
      return current?.phase !== "review"
        ? json(publicOperation(current!))
        : json(
            { error: "Another confirmation is in progress. Check its status." },
            409,
          );
    }
    const execute = async () => {
      // Validation failures happen before submitting. After that point, errors retain the lock.
      try {
        const fresh = await check(db, bank, p.settings, p.manualBills);
        if (
          fresh.from !== p.from ||
          fresh.to !== p.to ||
          fresh.state.checking !== p.checking ||
          fresh.state.savings !== p.savings ||
          fresh.analysis.reserve !== p.reserve ||
          op!.amount / 100 > fresh.analysis.idle ||
          p.expires < Date.now()
        ) {
          await finish(
            db,
            op!,
            "failed",
            "Banking data changed. Review a fresh amount.",
          );
          return json(publicOperation((await getOperation(db, op!.id))!), 409);
        }
      } catch {
        await finish(
          db,
          op!,
          "failed",
          "Banking data could not be verified. No transfer was submitted.",
        );
        return json(publicOperation((await getOperation(db, op!.id))!), 503);
      }
      await db
        .prepare(
          "UPDATE grow_operations SET phase='submitting',updated=? WHERE id=? AND phase='review'",
        )
        .bind(Date.now(), op!.id)
        .run();
      try {
        const receipt = await bank.create(
          op!.amount / 100,
          p.memo,
          p.date,
          p.from,
        );
        await db
          .prepare("UPDATE grow_operations SET receipt=?,updated=? WHERE id=?")
          .bind(receipt, Date.now(), op!.id)
          .run();
        op = (await getOperation(db, op!.id))!;
        op = await reconcile(db, bank, op);
        if (op.phase === "completed") invalidate();
        return json(publicOperation(op));
      } catch (e) {
        if (e instanceof Rejected) await finish(db, op!, "failed", e.message);
        else
          await db
            .prepare(
              "UPDATE grow_operations SET phase='uncertain',error=?,updated=? WHERE id=?",
            )
            .bind(
              "Nessie outcome is uncertain. No automatic retry or additional move will be made.",
              Date.now(),
              op!.id,
            )
            .run();
        return json(publicOperation((await getOperation(db, op!.id))!));
      }
    };
    const job = execute();
    waitUntil?.(job);
    return await job;
  } catch {
    return json(
      {
        error:
          "Transfer storage or banking is unavailable. Check status before trying another move.",
      },
      503,
    );
  }
}
