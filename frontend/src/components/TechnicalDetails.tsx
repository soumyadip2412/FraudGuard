import { featureLadder, formatOdds } from "../lib/explanation";
import { formatNumber, formatPercent, sigmoid } from "../lib/format";
import type { Explanation, Prediction } from "../types";
import { EvidenceLadder } from "./EvidenceLadder";

/** Per-feature SHAP detail for analysts and developers, collapsed by default. */
export function TechnicalDetails({ prediction, explanation }: { prediction: Prediction; explanation: Explanation }) {
  const ladder = featureLadder(prediction);
  const { technical, unusualness, reference } = explanation;

  return (
    <details className="technical">
      <summary>Technical details</summary>
      <p className="hint">
        For analysts and developers. V1 to V28 are anonymised model features; their real-world meanings aren't available.
        Contributions are SHAP values in log-odds; an odds multiplier applies to the odds of fraud, not the probability.
      </p>
      {ladder && <EvidenceLadder input={ladder} />}
      <div className="table-scroll">
        <table className="ledger">
          <caption>Largest individual contributions</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col" className="num">Value</th>
              <th scope="col" className="num">Contribution</th>
              <th scope="col" className="num">Odds multiplier</th>
              <th scope="col" className="num">Percentile</th>
            </tr>
          </thead>
          <tbody>
            {technical.top_features.map((f) => (
              <tr key={f.feature}>
                <td>{f.feature}</td>
                <td className="num">{formatNumber(f.value)}</td>
                <td className="num">{formatNumber(f.contribution, 3, true)}</td>
                <td className="num">{formatOdds(f.odds_multiplier)}</td>
                <td className="num">{f.percentile.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="tech-facts">
        <dt>Base value</dt>
        <dd>
          {formatNumber(technical.base_value, 3)} log-odds ({formatPercent(sigmoid(technical.base_value))} before any feature)
        </dd>
        <dt>Combined odds multipliers</dt>
        <dd>
          Amount {formatOdds(explanation.amount.odds_multiplier)}, anonymised characteristics{" "}
          {formatOdds(explanation.anonymised.odds_multiplier)}
        </dd>
        <dt>Unusualness percentile</dt>
        <dd>
          {unusualness.percentile.toFixed(2)} (ranked distance from {unusualness.comparison_group}); extreme means rarer than 1 in{" "}
          {Math.round(1 / unusualness.rarity_threshold).toLocaleString()}
        </dd>
        <dt>Reference data</dt>
        <dd>{reference.dataset_description}</dd>
        <dt>Model</dt>
        <dd>{reference.model_version}</dd>
      </dl>
      <details className="technical-nested">
        <summary>Percentile of every input</summary>
        <ul className="percentile-grid">
          {Object.entries(technical.feature_percentiles).map(([name, p]) => (
            <li key={name}>
              <span>{name}</span> {p.toFixed(2)}
            </li>
          ))}
        </ul>
      </details>
    </details>
  );
}
