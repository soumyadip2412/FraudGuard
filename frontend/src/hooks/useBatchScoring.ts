import { useRef, useState } from "react";
import { api, errorMessage } from "../api";
import { type ParsedRow, parseTransactionFile } from "../lib/csv";
import { AMOUNT, type ModelInfo, type Prediction } from "../types";

// Requests in flight at once. The API scores each batch in its own worker thread,
// so a few concurrent chunks finish sooner than strictly one after another.
const CONCURRENCY = 3;

export interface ScoredRow {
  line: number;
  amount: number;
  probability: number;
  flagged: boolean;
  label: 0 | 1 | null;
}

export interface BatchResult {
  fileName: string;
  rows: ScoredRow[];
  skipped: number;
  hasLabels: boolean;
}

export type BatchState =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "scoring"; done: number; total: number }
  | { phase: "done"; result: BatchResult }
  | { phase: "error"; message: string };

const toScored = ({ line, features, label }: ParsedRow, prediction: Prediction): ScoredRow => ({
  line,
  amount: features[AMOUNT],
  probability: prediction.fraud_probability,
  flagged: prediction.is_fraud,
  label,
});

interface ScoreJob {
  rows: ParsedRow[];
  chunkSize: number;
  onProgress: (done: number) => void;
  isCancelled: () => boolean;
}

/** Scores rows in chunks of the API's batch limit, CONCURRENCY chunks at a time. Null if cancelled. */
async function scoreAll({ rows, chunkSize, onProgress, isCancelled }: ScoreJob): Promise<ScoredRow[] | null> {
  const chunkCount = Math.ceil(rows.length / chunkSize);
  const results: ScoredRow[][] = new Array(chunkCount);
  let next = 0;
  let done = 0;
  // Set by the first worker that fails, so the others stop instead of sending every
  // remaining chunk and overwriting the error with progress updates.
  let failed = false;

  async function worker() {
    while (next < chunkCount && !failed && !isCancelled()) {
      const start = next++ * chunkSize;
      const chunk = rows.slice(start, start + chunkSize);
      try {
        const predictions = await api.predictBatch(chunk.map((row) => row.features));
        results[start / chunkSize] = chunk.map((row, i) => toScored(row, predictions[i]));
      } catch (error) {
        failed = true;
        throw error;
      }
      done += chunk.length;
      if (!failed && !isCancelled()) onProgress(done);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return isCancelled() ? null : results.flat();
}

/** Parses a CSV file in the browser and scores it through /predictions/batch. */
export function useBatchScoring(model: ModelInfo) {
  const [state, setState] = useState<BatchState>({ phase: "idle" });
  const cancelled = useRef(false);

  async function start(file: File) {
    cancelled.current = false;
    setState({ phase: "reading", fileName: file.name });
    try {
      const parsed = await parseTransactionFile(file, model.features);
      if (parsed.missing.length > 0) throw new Error(`${file.name} is missing these columns: ${parsed.missing.join(", ")}.`);
      if (parsed.rows.length === 0) throw new Error(`${file.name} has no rows with valid numbers.`);

      const total = parsed.rows.length;
      const rows = await scoreAll({
        rows: parsed.rows,
        chunkSize: model.max_batch_size,
        onProgress: (done) => setState({ phase: "scoring", done, total }),
        isCancelled: () => cancelled.current,
      });
      if (!rows) return setState({ phase: "idle" });
      setState({ phase: "done", result: { fileName: file.name, rows, skipped: parsed.skipped, hasLabels: parsed.hasLabels } });
    } catch (error) {
      setState({ phase: "error", message: errorMessage(error) });
    }
  }

  const cancel = () => {
    cancelled.current = true;
  };
  const reset = () => setState({ phase: "idle" });

  return { state, start, cancel, reset };
}

export type BatchScoring = ReturnType<typeof useBatchScoring>;
