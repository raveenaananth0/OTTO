import { useContext } from "react";
import { OttoState } from "./OttoState";
export function useOttoData() {
  const value = useContext(OttoState);
  if (!value) throw new Error("OTTO data provider is missing.");
  return value;
}
