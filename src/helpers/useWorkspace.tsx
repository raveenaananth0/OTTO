import { useEffect, useState } from "react";
import { getWorkspace } from "../endpoints/workspace_GET.schema";
import {
  postWorkspace,
  type InputType,
} from "../endpoints/workspace_POST.schema";
import type { Workspace } from "./ottoWorkspace";
export function useWorkspace() {
  const [data, setData] = useState<Workspace>({
      forks: [],
      subscriptionRequests: {},
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getWorkspace()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(body: InputType) {
    setError("");
    try {
      const d = await postWorkspace(body);
      setData(d);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
      throw e;
    }
  }
  return {
    data,
    loading,
    error,
    change,
    refresh: async () => setData(await getWorkspace()),
  };
}
