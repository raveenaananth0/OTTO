import superjson from "superjson";
import { ottoWorkspace } from "../helpers/ottoWorkspace";
export async function handle(request: Request) {
  try {
    const hash = ottoWorkspace.session(request);
    return new Response(superjson.stringify(await ottoWorkspace.read(hash)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      superjson.stringify({
        error: e instanceof Error ? e.message : "Could not load workspace.",
      }),
      { status: 400 },
    );
  }
}
