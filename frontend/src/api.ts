import type { Features, ModelInfo, Prediction, StoredTransaction, TransactionPage } from "./types";

const BASE = "/api";
const KEY_STORAGE = "fraudguard.apiKey";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Storage can be unavailable (private windows, blocked site data); the key is then per-session only.
let sessionKey = "";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? sessionKey;
  } catch {
    return sessionKey;
  }
}

export function setApiKey(key: string): void {
  sessionKey = key;
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // keep the in-memory copy
  }
}

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

function describeError(status: number, detail: unknown): string {
  if (status === 401) return "This server requires an API key. Add it under API key in the top bar.";
  // 502/504 come from the proxy (nginx or Vite) when the API itself isn't answering.
  if (status === 502 || status === 504) return "The API stopped responding. Check that it's running, then try again.";
  if (Array.isArray(detail)) {
    return (detail as ValidationIssue[]).map((issue) => `${issue.loc.at(-1)}: ${issue.msg}`).join("; ");
  }
  if (typeof detail === "string") return detail;
  return `The server returned an unexpected error (HTTP ${status}).`;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = getApiKey();
  if (key) headers["X-API-Key"] = key;

  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the FraudGuard API. Check that the server is running.", 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(describeError(response.status, payload.detail), response.status);
  }
  return (await response.json()) as T;
}

export interface TransactionQuery {
  isFraud?: boolean;
  limit: number;
  offset: number;
}

export const api = {
  model: () => request<ModelInfo>("/model"),
  predict: (features: Features) => request<Prediction>("/predictions", features),
  predictBatch: (rows: Features[]) =>
    request<Prediction[]>("/predictions/batch?explain=false", { transactions: rows }),
  record: (features: Features) => request<StoredTransaction>("/transactions", features),
  transactions: ({ isFraud, limit, offset }: TransactionQuery) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (isFraud !== undefined) params.set("is_fraud", String(isFraud));
    return request<TransactionPage>(`/transactions?${params}`);
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
