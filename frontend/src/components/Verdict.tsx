import type { ReactNode } from "react";
import { formatPercent } from "../lib/format";
import type { Prediction } from "../types";
import { EvidenceLadder } from "./EvidenceLadder";

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
  const { base_value, top_features } = prediction;

  return (
    <section className={`verdict is-${standing}`}>
      <Heading className="verdict-headline">{HEADLINES[standing]}</Heading>
      <p className="verdict-summary">{summaryOf(prediction, standing)}</p>
      {base_value !== null && top_features && (
        <>
          <EvidenceLadder input={{ ...prediction, base_value, top_features }} />
          <p className="ladder-key">
            Starting from a typical transaction, each row moves the score toward fraud (gold) or away from it (gray).
            V1 to V28 are features the card issuer anonymised before sharing the data.
          </p>
        </>
      )}
      {children}
    </section>
  );
}
