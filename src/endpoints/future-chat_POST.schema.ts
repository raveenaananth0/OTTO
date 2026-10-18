import { z } from "zod";
import { ottoSchemas } from "../helpers/ottoSchemas";
export const schema = z.object({
  source: ottoSchemas.source,
  habits: ottoSchemas.habits,
  messages: ottoSchemas.messages,
});
export type InputType = z.infer<typeof schema>;
export type OutputType = { reply: string };
