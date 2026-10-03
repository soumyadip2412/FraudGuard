import { type FormEvent, useState } from "react";
import type { TransactionFormState } from "../hooks/useTransactionForm";
import { describeMissing, parseTransactions } from "../lib/csv";
import { formatAmount } from "../lib/format";
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
      <p className="view-lede">Choose a transaction from the dataset, then check it.</p>
      <SamplePicker onPick={form.fill} />
      <div className="other-sources">
        <PasteRow features={form.features} onFill={form.fill} />
        <a className="btn btn-secondary" href="#batch">
          Upload a CSV file
        </a>
      </div>
      <AmountField form={form} />
      <AdvancedFields form={form} />
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
    if (missing.length > 0) return setError(describeMissing("That row", missing, features));
    if (rows.length === 0) return setError("That row has empty or non-numeric values.");
    setError(null);
    onFill(rows[0].features);
  }

  return (
    <details className="paste-row">
      <summary className="btn btn-secondary">Paste a dataset row</summary>
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

function AmountField({ form }: { form: TransactionFormState }) {
  const { originalAmount, amountIsWhatIf } = form;
  return (
    <div className="field field-amount">
      <label htmlFor={`f-${AMOUNT}`}>
        Transaction amount
        {amountIsWhatIf && <span className="tag tag-whatif">Amount what-if</span>}
      </label>
      <NumberInput name={AMOUNT} form={form} />
      {originalAmount === null ? (
        <p className="hint">Pick an example or paste a row to load a full transaction.</p>
      ) : amountIsWhatIf ? (
        <p className="hint">
          Hypothetical: the record's own amount is {formatAmount(originalAmount)}. The 28 anonymised characteristics stay
          as they are in the record.{" "}
          <button type="button" className="btn-inline" onClick={form.resetAmount}>
            Reset amount
          </button>
        </p>
      ) : (
        <p className="hint">From the selected record. Change it to see how the amount alone affects the score.</p>
      )}
    </div>
  );
}

function AdvancedFields({ form }: { form: TransactionFormState }) {
  const anonymised = form.features.filter((name) => name !== AMOUNT);
  return (
    <details className="advanced">
      <summary>Advanced: enter anonymised model features</summary>
      <p className="hint">
        V1 to V28 are anonymised characteristics from the source dataset; their real-world meanings aren't available.
        Picking an example or pasting a row fills them in.
      </p>
      <fieldset className="field-grid">
        <legend>Anonymised model features</legend>
        {anonymised.map((name) => (
          <div className="field" key={name}>
            <label htmlFor={`f-${name}`}>{name}</label>
            <NumberInput name={name} form={form} />
          </div>
        ))}
      </fieldset>
    </details>
  );
}

function NumberInput({ name, form }: { name: string; form: TransactionFormState }) {
  return (
    <input
      id={`f-${name}`}
      type="number"
      step="any"
      inputMode="decimal"
      value={form.values[name]}
      onChange={(event) => form.setField(name, event.target.value)}
    />
  );
}
