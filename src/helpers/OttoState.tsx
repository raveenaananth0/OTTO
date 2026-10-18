import { createContext } from "react";
import type { SimState } from "./simTypes";
export type Source = "demo" | "nessie";
export const OttoState = createContext<{
  state: SimState;
  source: Source;
  loading: boolean;
  initialized: boolean;
  notice: string;
  setSource: (source: Source) => Promise<void>;
  refresh: () => Promise<void>;
} | null>(null);
