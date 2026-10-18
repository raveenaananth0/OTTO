import { z } from "zod";
const habits = z.object({
  delivery: z.number().min(0).max(10000),
  coffee: z.number().min(0).max(10000),
  invest: z.number().min(0).max(1e9),
  savePerPayday: z.number().min(0).max(1e9),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().trim().min(1).max(60),
        kind: z.enum(["expense", "saving", "investment"]),
        frequency: z.enum(["day", "week", "month", "year", "payday"]),
        amount: z.number().min(0).max(10000),
      }),
    )
    .max(20)
    .refine(
      (items) => new Set(items.map((i) => i.id)).size === items.length,
      "Habit IDs must be unique.",
    )
    .optional(),
  statement: z.string().max(240).optional(),
  targetYear: z.number().int().min(2027).max(2076).optional(),
});
export const ottoSchemas = {
  habits,
  source: z.enum(["demo", "nessie"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(6000),
      }),
    )
    .min(1)
    .max(12)
    .refine(
      (m) =>
        m.at(-1)?.role === "user" &&
        m
          .filter((v) => v.role === "user")
          .every((v) => v.content.length <= 2000),
    ),
};
