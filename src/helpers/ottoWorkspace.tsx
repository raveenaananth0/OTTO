import { createHash } from "node:crypto";
import { db } from "./db";
import type { Habits } from "./projectFuture";
export type Fork = {
  id: string;
  name: string;
  habits: Habits;
  source: "demo" | "nessie";
  createdAt: string;
};
export type Workspace = {
  forks: Fork[];
  plan?: {
    forkId: string;
    name: string;
    habits: Habits;
    source: "demo" | "nessie";
    committedAt: string;
    paydayEnabled: boolean;
  };
  subscriptionRequests: Record<string, string>;
};
const empty = (): Workspace => ({ forks: [], subscriptionRequests: {} });
function session(request: Request) {
  const token = request.headers.get("X-Otto-Session");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Refresh OTTO to initialize your private demo workspace.");
  return createHash("sha256").update(token).digest("hex");
}
async function read(hash: string) {
  await db
    .insertInto("ottoWorkspaces")
    .values({ sessionHash: hash, data: empty() as never })
    .onConflict((c) => c.column("sessionHash").doNothing())
    .execute();
  const row = await db
    .selectFrom("ottoWorkspaces")
    .select("data")
    .where("sessionHash", "=", hash)
    .executeTakeFirstOrThrow();
  return row.data as unknown as Workspace;
}
async function update(hash: string, change: (data: Workspace) => Workspace) {
  return db.transaction().execute(async (tx) => {
    await tx
      .insertInto("ottoWorkspaces")
      .values({ sessionHash: hash, data: empty() as never })
      .onConflict((c) => c.column("sessionHash").doNothing())
      .execute();
    const row = await tx
      .selectFrom("ottoWorkspaces")
      .select("data")
      .where("sessionHash", "=", hash)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const data = change(row.data as unknown as Workspace);
    await tx
      .updateTable("ottoWorkspaces")
      .set({ data: data as never, updatedAt: new Date() })
      .where("sessionHash", "=", hash)
      .execute();
    return data;
  });
}
export const ottoWorkspace = { session, read, update };
