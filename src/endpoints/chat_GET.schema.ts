import { z } from "zod";
import superjson from "superjson";
export const schema = z.object({});
export type OutputType = { configured: boolean };
export async function getChat(): Promise<OutputType> {
  const r = await fetch("/_api/chat");
  const data = superjson.parse<OutputType & { error?: string }>(await r.text());
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return z.object({ configured: z.boolean() }).parse(data);
}
