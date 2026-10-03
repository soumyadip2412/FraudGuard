import { formatCount, formatDate, formatNumber, formatPercent, modelName } from "../lib/format";
import type { ModelInfo } from "../types";

const STRATEGIES: Record<string, string> = {
  none: "It learned from the data as it is, without rebalancing fraud and legitimate examples.",
  class_weight: "Fraud examples were weighted more heavily during training, to make up for how rare they are.",
  smote: "Synthetic fraud examples (SMOTE) were added during training, to make up for how rare real ones are.",
};


export function ModelView({ model }: { model: ModelInfo }) {
  const m = model.test_metrics;
  const frauds = m.tp + m.fn;
  const legit = m.tn + m.fp;

  return (
    <div className="narrow">
      <h1 className="view-title">{modelName(model.model)}</h1>
      <p className="view-lede">
        Trained {model.trained_at ? `${formatDate(model.trained_at)} ` : ""}on real card transactions from the creditcard.csv dataset.{" "}
        {STRATEGIES[model.imbalance_strategy ?? ""] ?? ""}
      </p>

      <h2 className="section-title">On transactions it never saw</h2>
      <p className="body-copy">
        These results come from a held-out test set of {formatCount(frauds + legit)} transactions, kept aside during
        training so they show how the model does on new data.
      </p>
      <dl className="facts">
        <Fact term="Frauds caught" value={`${formatCount(m.tp)} of ${formatCount(frauds)}`} note={`${formatPercent(m.recall)} of all fraud (recall). ${formatCount(m.fn)} slipped through.`} />
        <Fact term="False alarms" value={formatCount(m.fp)} note={`Legitimate transactions flagged, out of ${formatCount(legit)}.`} />
        <Fact term="Flags that were fraud" value={formatPercent(m.precision)} note="How often a flag is right (precision)." />
        <Fact term="PR-AUC" value={formatNumber(m.pr_auc, 3)} note="Ranking quality across every possible threshold. 1 is perfect; random guessing scores about 0.002." />
      </dl>

      <h2 className="section-title">When a transaction is flagged</h2>
      <p className="body-copy">
        A transaction is flagged when its fraud chance is {formatPercent(model.threshold)} or higher. The cut-off was
        chosen on separate validation data to balance catching fraud against false alarms. Lowering it would catch more
        fraud but block more genuine customers.
      </p>

      <h2 className="section-title">About the data</h2>
      <ul className="body-copy guide-list">
        <li>Real card transactions by European cardholders over two days in September 2013 (the creditcard.csv dataset).</li>
        <li>
          The model uses {model.features.length} inputs: the <strong>transaction amount</strong>, plus{" "}
          <strong>28 anonymised characteristics</strong> that the card issuer derived from the original details with a PCA so
          customers can't be identified.
        </li>
        <li>
          The anonymised characteristics can't be assigned real-world meanings: the original details and the mapping
          weren't released. Explanations therefore treat them as one group.
        </li>
        <li>The transaction time isn't used, because in this dataset it only counts seconds from the first transaction.</li>
      </ul>

      <details className="technical">
        <summary>Technical details</summary>
        <p className="hint">
          Imbalance handling: {model.imbalance_strategy ?? "default"}. Batch requests are limited to{" "}
          {formatCount(model.max_batch_size)} transactions. Model inputs, in the order the model expects:
        </p>
        <p className="feature-list">{model.features.join(", ")}</p>
      </details>
    </div>
  );
}

function Fact({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="fact">
      <dt>{term}</dt>
      <dd className="fact-value">{value}</dd>
      <dd className="fact-note">{note}</dd>
    </div>
  );
}
