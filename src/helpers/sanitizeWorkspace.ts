import { z } from "zod";
import { ottoSchemas } from "./ottoSchemas";
import type { Workspace } from "./ottoWorkspace";
const fork = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  habits: ottoSchemas.habits,
  source: ottoSchemas.source,
  createdAt: z.string(),
});
const plan = z.object({
  forkId: z.string(),
  name: z.string(),
  habits: ottoSchemas.habits,
  source: ottoSchemas.source,
  committedAt: z.string(),
  paydayEnabled: z.boolean(),
});
export function sanitizeWorkspace(value: unknown): Workspace {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const forks = Array.isArray(v.forks)
    ? v.forks
        .flatMap((f) => {
          const r = fork.safeParse(f);
          return r.success ? [r.data] : [];
        })
        .filter((f, i, all) => all.findIndex((x) => x.id === f.id) === i)
        .filter(
          (f, i, all) =>
            all.slice(0, i).filter((x) => x.source === f.source).length < 3,
        )
    : [];
  const p = plan.safeParse(v.plan);
  return {
    forks,
    subscriptionRequests:
      z
        .record(z.enum(["requested", "merchant-confirmed", "dismissed"]))
        .safeParse(v.subscriptionRequests).data ?? {},
    ...(p.success && forks.some((f) => f.id === p.data.forkId)
      ? { plan: p.data }
      : {}),
  };
}
