import { z } from "zod";
import { ottoApi } from "../helpers/ottoApi";
import type { Workspace } from "../helpers/ottoWorkspace";
export const schema = z.object({});
export type OutputType = Workspace;
export const getWorkspace = () => ottoApi.get<OutputType>("workspace");
