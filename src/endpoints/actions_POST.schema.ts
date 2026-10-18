import { z } from "zod";
export const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("first_transfer"),
    forkId: z.string().uuid(),
    confirm: z.literal(true),
  }),
  z.object({
    kind: z.literal("stop_bill"),
    billId: z.string().min(1).max(100),
    confirm: z.literal(true),
  }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = import("../helpers/executeOnce").ActionReceipt;
