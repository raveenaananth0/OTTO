import superjson from "superjson";
let memoryToken = "";
function token() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = localStorage.getItem("otto-session") || "";
  } catch {}
  if (!/^[a-f0-9]{64}$/.test(memoryToken)) {
    memoryToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    try {
      localStorage.setItem("otto-session", memoryToken);
    } catch {}
  }
  return memoryToken;
}
async function request<T>(route: string, body?: unknown): Promise<T> {
  const r = await fetch("/_api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Otto-Session": token() },
    body: body === undefined ? undefined : superjson.stringify(body),
  });
  const data = superjson.parse<T & { error?: string }>(await r.text());
  if (!r.ok) throw new Error(data.error || "Could not complete the request.");
  return data;
}
export const ottoApi = {
  get: <T,>(route: string) => request<T>(route),
  post: <T,>(route: string, body: unknown) => request<T>(route, body),
};
