import { useRef, useState } from "react";
import { api, errorMessage } from "../api";
import { describeMissing, type ParsedRow, parseTransactionFile } from "../lib/csv";
import { TOP_RISKS, topIndices } from "../lib/batch";
import { reasonText } from "../lib/explanation";
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
  reason: string | null; // short grouped explanation; only fetched for the riskiest rows (see addReasons)
}

export interface BatchResult {
  fileName: string;
  rows: ScoredRow[];
  skipped: number;
  hasLabels: boolean;
  hasReasons: boolean;
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
  reason: null,
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
        const predictions = await api.predictBatch(chunk.map((row) => row.features), false);
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

/**
 * Explains only the rows the results table shows. Explanations make responses ~15x larger and
 * much slower, so explaining every row of a big file would take minutes; one small request
 * for the riskiest rows takes about a second. Reasons are supplementary: if this request fails,
 * the scores stand and the table simply has no reason column.
 */
async function addReasons(scored: ScoredRow[], parsed: ParsedRow[]): Promise<boolean> {
  const top = topIndices(scored, TOP_RISKS); // scored[i] and parsed[i] are the same transaction
  try {
    const predictions = await api.predictBatch(top.map((i) => parsed[i].features), true);
    predictions.forEach((prediction, k) => {
      scored[top[k]].reason = prediction.explanation ? reasonText(prediction.explanation) : null;
    });
    return predictions.some((prediction) => prediction.explanation);
  } catch {
    return false;
  }
}

/** Parses a CSV file in the browser and scores it through /predictions/batch. */
export function useBatchScoring(model: ModelInfo) {
  const [state, setState] = useState<BatchState>({ phase: "idle" });
  // Each upload gets an id. Cancelling or starting another file moves the id on, so a
  // superseded run stops sending requests and its late responses are ignored.
  const currentRun = useRef(0);

  async function start(file: File) {
    const run = ++currentRun.current;
    const active = () => currentRun.current === run;
    setState({ phase: "reading", fileName: file.name });
    try {
      const parsed = await parseTransactionFile(file, model.features);
      if (parsed.missing.length > 0) throw new Error(describeMissing(file.name, parsed.missing, model.features));
      if (parsed.rows.length === 0) throw new Error(`${file.name} has no rows with valid numbers.`);
      if (!active()) return;

      const total = parsed.rows.length;
      setState({ phase: "scoring", done: 0, total }); // show progress straight away, before the first chunk returns
      const rows = await scoreAll({
        rows: parsed.rows,
        chunkSize: model.max_batch_size,
        onProgress: (done) => active() && setState({ phase: "scoring", done, total }),
        isCancelled: () => !active(),
      });
      if (!rows || !active()) return;
      const hasReasons = await addReasons(rows, parsed.rows);
      if (!active()) return;
      setState({ phase: "done", result: { fileName: file.name, rows, skipped: parsed.skipped, hasLabels: parsed.hasLabels, hasReasons } });
    } catch (error) {
      if (active()) setState({ phase: "error", message: errorMessage(error) });
    }
  }

  const cancel = () => {
    currentRun.current += 1;
    setState({ phase: "idle" }); // back to the picker at once; in-flight requests are discarded
  };
  const reset = () => setState({ phase: "idle" });

  return { state, start, cancel, reset };
}

export type BatchScoring = ReturnType<typeof useBatchScoring>;
