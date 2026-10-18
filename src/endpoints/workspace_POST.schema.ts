import { z } from "zod";
import { ottoSchemas } from "../helpers/ottoSchemas";
import { ottoApi } from "../helpers/ottoApi";
import type { Workspace } from "../helpers/ottoWorkspace";
export const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fork"),
    name: z.string().trim().min(1).max(60),
    habits: ottoSchemas.habits,
    source: ottoSchemas.source,
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    habits: ottoSchemas.habits,
  }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
  z.object({ action: z.literal("commit"), id: z.string().uuid() }),
  z.object({ action: z.literal("pause") }),
  z.object({
    action: z.literal("subscription"),
    id: z.string().max(100),
    status: z.enum(["requested", "merchant-confirmed", "dismissed"]),
  }),
]);
export type InputType = z.infer<typeof schema>;
export type OutputType = Workspace;
export const postWorkspace = (body: InputType) =>
  ottoApi.post<OutputType>("workspace", schema.parse(body));
