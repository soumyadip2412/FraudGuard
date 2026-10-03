import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { ModelInfo } from "../types";

export interface ServerStatus {
  model: ModelInfo | null;
  error: string | null;
  loading: boolean;
}

/** Loads the served model's metadata; the views need its feature list and threshold. */
export function useServerStatus(): [ServerStatus, () => void] {
  const [status, setStatus] = useState<ServerStatus>({ model: null, error: null, loading: true });

  const load = useCallback(async () => {
    setStatus((current) => ({ ...current, loading: true }));
    try {
      setStatus({ model: await api.model(), error: null, loading: false });
    } catch (error) {
      setStatus({ model: null, error: errorMessage(error), loading: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return [status, load];
}
