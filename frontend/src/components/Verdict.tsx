import type { ReactNode } from "react";
import { featureLadder } from "../lib/explanation";
import { formatPercent } from "../lib/format";
import type { Prediction } from "../types";
import { EvidenceLadder } from "./EvidenceLadder";
import { ExplanationSummary } from "./ExplanationSummary";
import { TechnicalDetails } from "./TechnicalDetails";

type Standing = "flagged" | "borderline" | "clear";

const HEADLINES: Record<Standing, string> = {
  flagged: "Likely fraud",
  borderline: "Borderline, not flagged",
  clear: "Looks legitimate",
};

function standingOf({ is_fraud, fraud_probability, threshold }: Prediction): Standing {
  if (is_fraud) return "flagged";
  return fraud_probability >= threshold / 2 ? "borderline" : "clear";
}

function summaryOf(prediction: Prediction, standing: Standing): string {
  const chance = `${formatPercent(prediction.fraud_probability)} chance of fraud`;
  const threshold = formatPercent(prediction.threshold);
  if (standing === "flagged") return `${chance}, above the ${threshold} threshold for flagging.`;
  if (standing === "borderline") return `${chance}, under the ${threshold} threshold but high enough to be worth a manual review.`;
  return `${chance}, well under the ${threshold} threshold for flagging.`;
}

interface VerdictProps {
  prediction: Prediction;
  headingLevel?: "h2" | "h3";
  children?: ReactNode;
}

export function Verdict({ prediction, headingLevel = "h2", children }: VerdictProps) {
  const standing = standingOf(prediction);
  const Heading = headingLevel;
  const { explanation } = prediction;

  return (
    <section className={`verdict is-${standing}`}>
      <Heading className="verdict-headline">{HEADLINES[standing]}</Heading>
      <p className="verdict-summary">{summaryOf(prediction, standing)}</p>
      {explanation ? (
        <>
          <ExplanationSummary prediction={prediction} explanation={explanation} headingLevel={headingLevel === "h2" ? "h3" : "h4"} />
          <TechnicalDetails prediction={prediction} explanation={explanation} />
        </>
      ) : (
        <FeatureFallback prediction={prediction} />
      )}
      {children}
    </section>
  );
}

/** Responses without an explanation object (older API, older log entries) keep the per-feature view. */
function FeatureFallback({ prediction }: { prediction: Prediction }) {
  const ladder = featureLadder(prediction);
  if (!ladder) return null;
  return (
    <>
      <EvidenceLadder input={ladder} />
      <p className="ladder-key">
        Starting from a typical transaction, each row moves the score toward fraud (gold) or away from it (gray). V1 to V28
        are anonymised characteristics; their real-world meanings aren't available.
      </p>
    </>
  );
}
