import superjson from "superjson";
import { randomUUID } from "node:crypto";
import { db } from "../helpers/db";
import { schema } from "./actions_POST.schema";
import { ottoWorkspace } from "../helpers/ottoWorkspace";
import { nessieApi } from "../helpers/nessieApi";
import { executeOnce, type ActionReceipt } from "../helpers/executeOnce";
import { transferGuard } from "../helpers/transferGuard";
import { subscriptionProvider } from "../helpers/subscriptions";
import { loadSimulationState } from "../helpers/loadSimulationState";
import { projectFuture } from "../helpers/projectFuture";
const json = (data: unknown, status = 200) =>
  new Response(superjson.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
export async function handle(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 4000) throw new Error("Request too large.");
    const body = schema.parse(superjson.parse(text)),
      hash = ottoWorkspace.session(request),
      workspace = await ottoWorkspace.read(hash);
    let amount: number | undefined;
    let perform: () => Promise<ActionReceipt>;
    let actionKey: string;
    if (body.kind === "first_transfer") {
      return json(
        {
          error:
            "Email-approved payments are in preview mode. No Nessie transfer was sent.",
        },
        503,
      );
    } else {
      actionKey = hash + ":stop-bill:" + body.billId;
      perform = async () => {
        const accounts = await nessieApi.getDemoAccounts(),
          bill = (await nessieApi.getBills(accounts.checking._id)).find(
            (b) => b._id === body.billId,
          );
        if (
          !bill ||
          !subscriptionProvider({
            id: bill._id,
            payee: bill.payee,
            amount: bill.payment_amount,
            dueDay: 1,
          })
        )
          return {
            status: "rejected",
            detail:
              "Only a recognized subscription bill belonging to this demo checking account can be stopped.",
          };
        if (bill.status === "cancelled")
          return {
            status: "completed",
            detail:
              "This sandbox scheduled payment is already canceled. The merchant subscription is separate.",
          };
        await nessieApi.stopBill(bill._id);
        return {
          status: "submitted",
          detail:
            "Nessie accepted the request to stop the " +
            bill.payee +
            " sandbox payment. Complete the merchant cancellation separately.",
        };
      };
    }
    const receipt = await executeOnce(
      actionKey,
      {
        reserve: async (key) => {
          const id = randomUUID(),
            inserted = await db
              .insertInto("ottoActions")
              .values({
                id,
                sessionHash: hash,
                actionKey: key,
                kind: body.kind,
                amount: amount ?? null,
                status: "pending",
                detail:
                  "This action is already being processed. Check Nessie before trying anything else.",
              })
              .onConflict((c) => c.column("actionKey").doNothing())
              .returning("id")
              .executeTakeFirst();
          if (inserted)
            return {
              created: true,
              receipt: { status: "pending", detail: "Processing." },
            };
          const row = await db
            .selectFrom("ottoActions")
            .selectAll()
            .where("actionKey", "=", key)
            .executeTakeFirstOrThrow();
          return {
            created: false,
            receipt: {
              status: row.status,
              detail: row.detail || "Check Nessie for this action's status.",
              externalId: row.externalId || undefined,
            },
          };
        },
        finish: async (key, result) => {
          await db
            .updateTable("ottoActions")
            .set({
              status: result.status,
              detail: result.detail,
              externalId: result.externalId ?? null,
            })
            .where("actionKey", "=", key)
            .execute();
        },
      },
      perform,
    );
    return json(receipt);
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error ? e.message : "Could not process this action.",
      },
      400,
    );
  }
}
