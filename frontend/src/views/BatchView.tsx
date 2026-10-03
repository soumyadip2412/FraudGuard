import { type DragEvent, useState } from "react";
import { BatchResults } from "../components/BatchResults";
import { Notice } from "../components/Notice";
import { type BatchScoring, useBatchScoring } from "../hooks/useBatchScoring";
import { formatCount } from "../lib/format";
import type { ModelInfo } from "../types";

export function BatchView({ model }: { model: ModelInfo }) {
  const batch = useBatchScoring(model);

  return (
    <div className="narrow-wide">
      <h1 className="view-title">Check a file of transactions</h1>
      <p className="view-lede">
        Upload a CSV with a header row containing V1 to V28 and Amount, like creditcard.csv. If it also has a Class
        column, you'll see how the model's decisions compare with the real labels.
      </p>
      <BatchBody batch={batch} />
    </div>
  );
}

function BatchBody({ batch: { state, start, cancel, reset } }: { batch: BatchScoring }) {
  switch (state.phase) {
    case "reading":
      return <p className="loading-line">Reading {state.fileName}…</p>;
    case "scoring":
      return <Progress done={state.done} total={state.total} onCancel={cancel} />;
    case "done":
      return <BatchResults result={state.result} onReset={reset} />;
    default:
      return (
        <>
          {state.phase === "error" && <Notice tone="error">{state.message}</Notice>}
          <FilePicker onFile={start} />
        </>
      );
  }
}

function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <label
      className={`dropzone${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
      />
      <span className="btn btn-primary">Choose a CSV file</span>
      <span className="hint">or drop it here. The file is read in your browser; only the feature values are sent to the API.</span>
    </label>
  );
}

function Progress({ done, total, onCancel }: { done: number; total: number; onCancel: () => void }) {
  return (
    <div className="progress-block">
      <p className="body-copy" aria-live="polite">
        Scored {formatCount(done)} of {formatCount(total)} transactions
      </p>
      <progress className="progress" value={done} max={total} />
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
