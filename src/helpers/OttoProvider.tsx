import { bankDisplayText } from "./bankDisplayText";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { OttoState, type Source } from "./OttoState";
import { fakeMonth } from "./fakeMonth";
import { getNessie } from "../endpoints/nessie_GET.schema";
import {
  useManualSubscriptions,
  mergeManualSubscriptions,
} from "./manualSubscriptions";
export function OttoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(fakeMonth),
    [source, changeSource] = useState<Source>("demo"),
    [loading, setLoading] = useState(true),
    [initialized, setInitialized] = useState(false),
    [notice, setNotice] = useState("");
  const manual = useManualSubscriptions();
  const merged = useMemo(
    () => mergeManualSubscriptions(state, manual.items),
    [state, manual.items],
  );
  const revision = useRef(0);
  const setSource = useCallback(async (next: Source) => {
    const requestId = ++revision.current;
    try {
      localStorage.setItem("otto-data-source", next);
    } catch {}
    setLoading(true);
    setNotice("");
    if (next === "demo") {
      setState(fakeMonth);
      changeSource("demo");
      setLoading(false);
      setInitialized(true);
      return;
    }
    try {
      const result = await getNessie();
      if (requestId !== revision.current) return;

      setState((previous) =>
        JSON.stringify(previous) === JSON.stringify(result.state)
          ? previous
          : result.state,
      );
      changeSource("nessie");
    } catch (e) {
      if (requestId !== revision.current) return;
      setState(fakeMonth);
      changeSource("demo");
      setNotice(
        bankDisplayText(e instanceof Error ? e.message : "Bank connection unavailable.") +
          " Using the scripted month instead.",
      );
    } finally {
      if (requestId === revision.current) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }, []);
  useEffect(() => {
    let saved: Source = "nessie";
    try {
      if (localStorage.getItem("otto-data-source") === "demo") saved = "demo";
    } catch {}
    void setSource(saved);
  }, [setSource]);
  useEffect(() => {
    if (source !== "nessie") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void setSource("nessie");
    }, 60000);
    return () => window.clearInterval(timer);
  }, [source, setSource]);
  useEffect(() => {
    const updated = () => {
      if (source === "nessie") void setSource("nessie");
    };
    window.addEventListener("otto-grow-updated", updated);
    return () => window.removeEventListener("otto-grow-updated", updated);
  }, [source, setSource]);
  return (
    <OttoState.Provider
      value={{
        state: merged,
        source,
        loading,
        initialized,
        notice,
        setSource,
        refresh: () => setSource(source),
      }}
    >
      {children}
    </OttoState.Provider>
  );
}
