import { changeWorkspace } from "../helpers/changeWorkspace";
import superjson from "superjson";
import { randomUUID } from "node:crypto";
import { schema } from "./workspace_POST.schema";
import { ottoWorkspace } from "../helpers/ottoWorkspace";
import { loadSimulationState } from "../helpers/loadSimulationState";
import { projectFuture } from "../helpers/projectFuture";
import { futureState } from "../helpers/futureState";
export async function handle(request: Request) {
  try {
    const body = schema.parse(superjson.parse(await request.text())),
      hash = ottoWorkspace.session(request);
    if (body.action === "commit") {
      const data = await ottoWorkspace.read(hash),
        fork = data.forks.find((f) => f.id === body.id);
      if (!fork) throw new Error("Timeline not found.");
      const state = await loadSimulationState(fork.source);
      if (!projectFuture(futureState(state, fork.source), fork.habits).feasible)
        throw new Error(
          "This plan allocates more than your current monthly surplus. Adjust the sliders first.",
        );
    }
    const data = await ottoWorkspace.update(hash, (data) =>
      changeWorkspace(data, body, randomUUID(), new Date().toISOString()),
    );
    return new Response(superjson.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      superjson.stringify({
        error: e instanceof Error ? e.message : "Could not save changes.",
      }),
      { status: 400 },
    );
  }
}
