// Plain-language wording for the backend's explanation object. Everything here restates
// numbers the API computed; nothing assigns a real-world meaning to V1-V28.
import type { LadderInput } from "../components/EvidenceLadder";
import type { Direction, Explanation, Prediction, Strength } from "../types";
import { formatAmount, formatNumber } from "./format";

const ADVERBS: Record<Strength, string> = {
  negligible: "barely",
  slight: "slightly",
  moderate: "moderately",
  strong: "strongly",
};

/** "The transaction amount moderately increased the model's score." */
export function effectSentence(subject: string, direction: Direction, strength: Strength): string {
  if (direction === "unchanged" || strength === "negligible") return `${subject} barely changed the model's score.`;
  return `${subject} ${ADVERBS[strength]} ${direction === "raised" ? "increased" : "decreased"} the model's score.`;
}

/** "strong increase", for compact places like the batch table. */
export function effectPhrase(direction: Direction, strength: Strength): string {
  if (direction === "unchanged" || strength === "negligible") return "little effect";
  return `${strength} ${direction === "raised" ? "increase" : "decrease"}`;
}

/** Where a value sits among legitimate training transactions, e.g. "higher than about 91%". */
export function percentilePhrase(percentile: number): string {
  if (percentile >= 99.95) return "higher than virtually all";
  if (percentile <= 0.05) return "lower than virtually all";
  const share = (p: number) => (p >= 99 ? p.toFixed(1) : String(Math.round(p)));
  return percentile >= 50 ? `higher than about ${share(percentile)}%` : `lower than about ${share(100 - percentile)}%`;
}

export function amountSentence(amount: Explanation["amount"]): string {
  return `${formatAmount(amount.value)}, ${percentilePhrase(amount.percentile)} of legitimate transactions in the training data.`;
}

// Wording bands for the unusualness percentile. They describe rarity among legitimate
// transactions only; they are not a fraud score.
export function unusualnessLabel(percentile: number): string {
  if (percentile >= 99.9) return "Very unusual";
  if (percentile >= 99) return "Highly unusual";
  if (percentile >= 95) return "Unusual";
  if (percentile >= 75) return "Somewhat unusual";
  return "Typical";
}

/** "Anonymised characteristics: strong increase · Amount: slight decrease" */
export function reasonText(explanation: Explanation): string {
  const { anonymised, amount } = explanation;
  return `Anonymised characteristics: ${effectPhrase(anonymised.direction, anonymised.strength)} · Amount: ${effectPhrase(amount.direction, amount.strength)}`;
}

/** The odds multiplier exp(contribution), readable at any size: ×2.49, ×91.1, ×27,973, ×1.4e-5. */
export function formatOdds(multiplier: number): string {
  if (multiplier >= 100) return `×${Math.round(multiplier).toLocaleString()}`;
  if (multiplier >= 10) return `×${multiplier.toFixed(1)}`;
  if (multiplier >= 0.01) return `×${multiplier.toFixed(2)}`;
  return `×${multiplier.toExponential(1)}`;
}

/** Default ladder: the amount and the anonymised characteristics as two exact, additive steps. */
export function groupedLadder(prediction: Prediction, explanation: Explanation): LadderInput {
  const { amount, anonymised, technical } = explanation;
  return {
    label: "How the amount and the anonymised characteristics moved the score",
    baseValue: technical.base_value,
    probability: prediction.fraud_probability,
    threshold: prediction.threshold,
    steps: [
      { key: "amount", label: "Transaction amount", detail: formatAmount(amount.value), contribution: amount.contribution, deltaText: amount.strength },
      {
        key: "anonymised",
        label: "Anonymised characteristics",
        detail: "28 combined",
        contribution: anonymised.combined_contribution,
        deltaText: anonymised.strength,
      },
    ],
  };
}

/** Technical ladder: the top individual features, exactly as returned by SHAP. */
export function featureLadder(prediction: Prediction): LadderInput | null {
  if (prediction.base_value === null || !prediction.top_features) return null;
  return {
    label: "How each feature moved the fraud score",
    baseValue: prediction.base_value,
    probability: prediction.fraud_probability,
    threshold: prediction.threshold,
    restLabel: "All other features",
    steps: prediction.top_features.map(({ feature, value, contribution }) => ({
      key: feature,
      label: feature,
      detail: `value ${formatNumber(value)}`,
      contribution,
    })),
  };
}
