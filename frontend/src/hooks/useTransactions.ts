import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { TransactionPage } from "../types";

export type LogFilter = "all" | "flagged" | "cleared";

const IS_FRAUD: Record<LogFilter, boolean | undefined> = { all: undefined, flagged: true, cleared: false };

interface LogState {
  page: TransactionPage | null;
  error: string | null;
  loading: boolean;
}

/** One page of recorded transactions; refetches when the filter or page changes. */
export function useTransactions(filter: LogFilter, offset: number, limit: number) {
  const [state, setState] = useState<LogState>({ page: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let stale = false; // ignore a slow response if the user has already moved on
    setState((current) => ({ ...current, loading: true }));
    api
      .transactions({ isFraud: IS_FRAUD[filter], limit, offset })
      .then((page) => !stale && setState({ page, error: null, loading: false }))
      .catch((error: unknown) => !stale && setState({ page: null, error: errorMessage(error), loading: false }));
    return () => {
      stale = true;
    };
  }, [filter, offset, limit, version]);

  return { ...state, reload };
}
