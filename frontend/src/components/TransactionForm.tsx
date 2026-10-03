import { type FormEvent, useState } from "react";
import type { TransactionFormState } from "../hooks/useTransactionForm";
import { parseTransactions } from "../lib/csv";
import { SAMPLES } from "../samples";
import { AMOUNT, type Features } from "../types";

export type CheckAction = "check" | "record";

interface TransactionFormProps {
  form: TransactionFormState;
  busy: CheckAction | null;
  onRun: (action: CheckAction) => void;
}

export function TransactionForm({ form, busy, onRun }: TransactionFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onRun("check");
  }

  return (
    <form className="panel check-form" onSubmit={submit} noValidate>
      <h1 className="view-title">Check a transaction</h1>
      <p className="view-lede">Enter a card transaction, or start from a real one the model has never seen.</p>
      <SamplePicker onPick={form.fill} />
      <PasteRow features={form.features} onFill={form.fill} />
      <FieldGrid form={form} />
      <div className="button-row form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          {busy === "check" ? "Checking…" : "Check transaction"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => onRun("record")}>
          {busy === "record" ? "Recording…" : "Check and record"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={form.clear}>
          Clear form
        </button>
      </div>
      <p className="hint">Check and record also saves the result to the log.</p>
    </form>
  );
}

function SamplePicker({ onPick }: { onPick: (features: Features) => void }) {
  return (
    <fieldset className="samples">
      <legend>Start from an example</legend>
      <div className="sample-list">
        {SAMPLES.map((sample) => (
          <button key={sample.id} type="button" className={`sample is-${sample.id}`} onClick={() => onPick(sample.features)}>
            <span className="sample-label">{sample.label}</span>
            <span className="sample-note">{sample.note}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PasteRow({ features, onFill }: { features: string[]; onFill: (features: Features) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function fillFromText() {
    const { rows, missing } = parseTransactions(text, features);
    if (missing.length > 0) return setError(`Couldn't find these columns: ${missing.join(", ")}.`);
    if (rows.length === 0) return setError("That row has empty or non-numeric values.");
    setError(null);
    onFill(rows[0].features);
  }

  return (
    <details className="paste-row">
      <summary>Paste a row from a CSV file</summary>
      <label htmlFor="paste-text" className="hint">
        A line from creditcard.csv works as is (Time, V1 to V28, Amount, Class). You can include the header line.
      </label>
      <textarea id="paste-text" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
      {error && <p className="field-error">{error}</p>}
      <button type="button" className="btn btn-secondary" onClick={fillFromText} disabled={!text.trim()}>
        Fill the form
      </button>
    </details>
  );
}

function FieldGrid({ form }: { form: TransactionFormState }) {
  const amount = form.features.includes(AMOUNT) ? AMOUNT : form.features[0];
  const anonymised = form.features.filter((name) => name !== amount);

  return (
    <div className="fields">
      <Field name={amount} form={form} className="field field-amount" />
      <fieldset className="field-grid">
        <legend>Anonymised features</legend>
        {anonymised.map((name) => (
          <Field key={name} name={name} form={form} className="field" />
        ))}
      </fieldset>
    </div>
  );
}

function Field({ name, form, className }: { name: string; form: TransactionFormState; className: string }) {
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`}>{name}</label>
      <input
        id={`f-${name}`}
        type="number"
        step="any"
        inputMode="decimal"
        value={form.values[name]}
        onChange={(event) => form.setField(name, event.target.value)}
      />
    </div>
  );
}
