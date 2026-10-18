import { validateState } from "../helpers/payroll";
import { z } from "zod";
import superjson from "superjson";
export const schema = z.object({});
export type OutputType = {
  state: import("../helpers/simTypes").SimState;
  source: string;
};
export async function getNessie(): Promise<OutputType> {
  const r = await fetch("/_api/nessie");
  const data = superjson.parse<OutputType & { error?: string }>(await r.text());
  if (!r.ok) throw new Error(data.error || "Request failed.");
  validateState(data.state);
  return data;
}
