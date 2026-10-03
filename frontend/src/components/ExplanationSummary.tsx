import {
  amountSentence,
  effectSentence,
  groupedLadder,
  unusualnessLabel,
} from "../lib/explanation";
import type { Explanation, Prediction } from "../types";
import { EvidenceLadder } from "./EvidenceLadder";

interface ExplanationSummaryProps {
  prediction: Prediction;
  explanation: Explanation;
  headingLevel: "h3" | "h4";
}

/** The default, user-facing answer to "why this score?": two additive groups plus rarity. */
export function ExplanationSummary({ prediction, explanation, headingLevel }: ExplanationSummaryProps) {
  const Heading = headingLevel;
  const { amount, anonymised, unusualness } = explanation;
  const counts = `${anonymised.raised_count} of them increased the score and ${anonymised.lowered_count} decreased it.`;

  return (
    <section className="drivers">
      <Heading className="drivers-title">What drove this score?</Heading>
      <dl className="drivers-list">
        <div className="driver">
          <dt>Transaction amount</dt>
          <dd>{amountSentence(amount)}</dd>
          <dd className="driver-effect">{effectSentence("The amount", amount.direction, amount.strength)}</dd>
        </div>
        <div className="driver">
          <dt>Anonymised characteristics</dt>
          <dd className="driver-effect">{effectSentence("Together, the 28 anonymised characteristics", anonymised.direction, anonymised.strength)}</dd>
          <dd className="hint">{counts}</dd>
        </div>
        <div className="driver">
          <dt>Overall transaction pattern</dt>
          <dd className="driver-effect">{unusualnessLabel(unusualness.percentile)} compared with legitimate training transactions.</dd>
          <dd className="hint">{unusualness.summary}</dd>
        </div>
      </dl>
      <EvidenceLadder input={groupedLadder(prediction, explanation)} />
      <p className="ladder-key">
        Starting from a typical transaction, each row moves the score toward fraud (gold) or away from it (gray).
      </p>
    </section>
  );
}
