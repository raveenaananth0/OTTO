import superjson from "superjson";
export async function handle() {
  return new Response(superjson.stringify({ configured: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
