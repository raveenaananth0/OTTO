import { z } from "zod";
import superjson from "superjson";
export const schema = z
  .object({
    growSettings: z
      .object({
        nextPayday: z.string().max(10),
        buffer: z.number().finite().min(0).max(100000),
        emergencyMonths: z.number().int().min(1).max(12),
      })
      .optional(),
    plannedBills: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(120),
          payee: z.string().trim().min(1).max(80),
          amount: z.number().min(0).max(10000),
          dueDay: z.number().int().min(1).max(30),
        }),
      )
      .max(100)
      .refine(
        (bills) => new Set(bills.map((b) => b.id)).size === bills.length,
        "Planned bill IDs must be unique.",
      )
      .optional(),
    source: z.enum(["demo", "nessie"]),
    level: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    day: z.number().int().min(0).max(30),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(6000),
        }),
      )
      .min(1)
      .max(12),
  })
  .refine(
    (v) =>
      v.messages.at(-1)?.role === "user" &&
      v.messages
        .filter((m) => m.role === "user")
        .every((m) => m.content.length <= 2000),
    "Send a question up to 2,000 characters.",
  );
export type InputType = z.infer<typeof schema>;
export type OutputType = { reply: string };
export async function postChat(
  body: InputType,
  signal?: AbortSignal,
): Promise<OutputType> {
  const r = await fetch("/_api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: superjson.stringify(schema.parse(body)),
    signal,
  });
  const data = superjson.parse<OutputType & { error?: string }>(await r.text());
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "Could not answer your question."),
      { status: r.status },
    );
  return z.object({ reply: z.string().min(1).max(100000) }).parse(data);
}
