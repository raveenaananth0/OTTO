import { withGrowBalances, type Database } from "./growLedger";
import { grow } from "./grow";
import { chat, type ChatEnv } from "./chat";
import superjson from "superjson";
import { loadNessie } from "./nessie";
// Generated from Vite output during the build, never from source or .env files.
// @ts-ignore generated module
import assets from "./assets.generated.js";
let cached:
  | {
      key: string;
      until: number;
      state: Awaited<ReturnType<typeof loadNessie>>;
    }
  | undefined;
let pending: Promise<Awaited<ReturnType<typeof loadNessie>>> | undefined;
const json = (data: unknown, status = 200) =>
  new Response(superjson.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(
    request: Request,
    env: { NESSIE_KEY?: string; DB?: Database } & ChatEnv,
    ctx?: { waitUntil(p: Promise<unknown>): void },
  ) {
    const path = new URL(request.url).pathname;
    if (path === "/_api/grow")
      return grow(
        request,
        env,
        () => {
          cached = undefined;
        },
        undefined,
        ctx ? (p) => ctx.waitUntil(p) : undefined,
      );
    if (path === "/_api/chat" || path === "/_api/otto-chat")
      return chat(request, env, async () => {
        if (
          cached &&
          cached.key === env.NESSIE_KEY &&
          cached.until > Date.now()
        )
          return withGrowBalances(cached.state, env.DB);
        return withGrowBalances(await loadNessie(env.NESSIE_KEY || ""), env.DB);
      });
    if (path === "/_api/nessie") {
      if (request.method !== "GET")
        return json({ error: "Read-only endpoint." }, 405);
      const key = env.NESSIE_KEY || "";
      try {
        if (!cached || cached.key !== key || cached.until < Date.now()) {
          // Coalesce refreshes so public demo visitors share a brief read cache.
          pending ??= loadNessie(key);
          try {
            cached = { key, state: await pending, until: Date.now() + 30000 };
          } finally {
            pending = undefined;
          }
        }
        return json({
          state: await withGrowBalances(cached.state, env.DB),
          source: "Nessie sandbox records with OTTO transfer ledger balances",
          fetchedAt: new Date().toISOString(),
        });
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : "Nessie is unavailable." },
          503,
        );
      }
    }
    if (path.startsWith("/_api/"))
      return json(
        { error: "This demo endpoint does not execute banking actions." },
        404,
      );
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const asset =
      assets[path] ||
      (!path.split("/").pop()?.includes(".")
        ? assets["/index.html"]
        : undefined);
    if (!asset) return new Response("Not found", { status: 404 });
    const body = asset.binary
      ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
      : asset.body;
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": asset.type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  },
};
