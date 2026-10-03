import { useState } from "react";
import { api, errorMessage } from "../api";
import { Notice } from "../components/Notice";
import { type CheckAction, TransactionForm } from "../components/TransactionForm";
import { Verdict } from "../components/Verdict";
import { useTransactionForm } from "../hooks/useTransactionForm";
import type { Features, ModelInfo, Prediction } from "../types";

interface Outcome {
  run: number; // remounts the verdict so its reveal plays for every new result
  prediction: Prediction;
  recordedId: number | null;
}

async function score(action: CheckAction, features: Features): Promise<Omit<Outcome, "run">> {
  if (action === "record") {
    const stored = await api.record(features);
    return { prediction: stored, recordedId: stored.id };
  }
  return { prediction: await api.predict(features), recordedId: null };
}

export function CheckView({ model }: { model: ModelInfo }) {
  const form = useTransactionForm(model.features);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CheckAction | null>(null);

  async function run(action: CheckAction) {
    const features = form.toFeatures();
    if (typeof features === "string") return setError(features);
    setBusy(action);
    setError(null);
    try {
      const { prediction, recordedId } = await score(action, features);
      setOutcome((previous) => ({ run: (previous?.run ?? 0) + 1, prediction, recordedId }));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="check-layout">
      <TransactionForm form={form} busy={busy} onRun={run} />
      <div className="check-result" aria-live="polite">
        {error && <Notice tone="error">{error}</Notice>}
        {outcome ? <Result outcome={outcome} /> : <EmptyResult />}
      </div>
    </div>
  );
}

function Result({ outcome }: { outcome: Outcome }) {
  return (
    <Verdict key={outcome.run} prediction={outcome.prediction}>
      {outcome.recordedId !== null && (
        <Notice tone="success">
          Recorded as transaction {outcome.recordedId}. <a href="#log">Open the log</a>
        </Notice>
      )}
    </Verdict>
  );
}

function EmptyResult() {
  return (
    <div className="verdict-empty">
      <h2 className="verdict-headline">No transaction checked yet</h2>
      <p className="body-copy">
        The verdict appears here, with the features that pushed the score toward or away from fraud. Try the caught
        fraud example to see a flagged one.
      </p>
    </div>
  );
}
