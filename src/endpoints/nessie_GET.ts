import superjson from "superjson";
import { loadSimulationState } from "../helpers/loadSimulationState";
import type { OutputType } from "./nessie_GET.schema";
export async function handle() {
  try {
    const state = await loadSimulationState("nessie");
    return new Response(
      superjson.stringify({
        state,
        source: "Nessie accounts and bills · scripted transactions",
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      superjson.stringify({
        error:
          error instanceof Error ? error.message : "Nessie is unavailable.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}
