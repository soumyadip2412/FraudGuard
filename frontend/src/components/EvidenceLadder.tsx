import type { CSSProperties } from "react";
import { formatNumber, formatPercent, logit, sigmoid } from "../lib/format";
import type { Contribution } from "../types";

// Probabilities marked on the axis; "minor" ones are hidden on narrow screens.
const TICKS = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 0.5, 0.9, 0.99, 0.999];
const MINOR_TICKS = new Set([1e-5, 1e-3, 0.1, 0.9, 0.999]);

type Kind = "start" | "up" | "down" | "end";
type Domain = [number, number];

interface Step {
  key: string;
  label: string;
  detail: string;
  from: number;
  to: number;
  kind: Kind;
}

/** What the ladder needs from a prediction; only explained predictions have it. */
export interface LadderInput {
  base_value: number;
  top_features: Contribution[];
  fraud_probability: number;
  threshold: number;
}

/** SHAP contributions are additive in log-odds, so each feature is one step of a walk. */
function buildSteps({ base_value: baseValue, top_features, fraud_probability: probability }: LadderInput): Step[] {
  const steps: Step[] = [
    { key: "start", label: "Typical transaction", detail: formatPercent(sigmoid(baseValue)), from: baseValue, to: baseValue, kind: "start" },
  ];
  let x = baseValue;
  for (const { feature, value, contribution } of top_features) {
    const kind = contribution >= 0 ? "up" : "down";
    steps.push({ key: feature, label: feature, detail: `value ${formatNumber(value)}`, from: x, to: x + contribution, kind });
    x += contribution;
  }
  const final = logit(probability);
  steps.push({ key: "rest", label: "All other features", detail: "combined", from: x, to: final, kind: final >= x ? "up" : "down" });
  steps.push({ key: "end", label: "This transaction", detail: formatPercent(probability), from: final, to: final, kind: "end" });
  return steps;
}

function domainFor(steps: Step[], threshold: number): Domain {
  const xs = steps.flatMap((step) => [step.from, step.to]).concat(logit(threshold));
  return [Math.min(...xs) - 1, Math.max(...xs) + 1];
}

const position = (x: number, [lo, hi]: Domain) => ((x - lo) / (hi - lo)) * 100;
const tickLabel = (p: number) => `${Number((p * 100).toPrecision(3))}%`;

export function EvidenceLadder({ input }: { input: LadderInput }) {
  const steps = buildSteps(input);
  const domain = domainFor(steps, input.threshold);
  const style = { "--threshold": `${position(logit(input.threshold), domain)}%` } as CSSProperties;

  return (
    <figure className="ladder" style={style}>
      <ol className="ladder-rows" aria-label="How each feature moved the fraud score">
        {steps.map((step, index) => (
          <LadderRow key={step.key} step={step} index={index} domain={domain} />
        ))}
      </ol>
      <LadderAxis domain={domain} threshold={input.threshold} />
    </figure>
  );
}

function LadderRow({ step, index, domain }: { step: Step; index: number; domain: Domain }) {
  const isMarker = step.kind === "start" || step.kind === "end";
  const left = position(Math.min(step.from, step.to), domain);
  const width = Math.max(Math.abs(position(step.to, domain) - position(step.from, domain)), 0.5);

  return (
    <li className={`ladder-row is-${step.kind}`} style={{ "--i": index } as CSSProperties}>
      <span className="ladder-label">
        {step.label}
        <span className="ladder-detail">{step.detail}</span>
      </span>
      <span className="ladder-track" aria-hidden="true">
        {isMarker ? (
          <span className="ladder-marker" style={{ left: `${left}%` }} />
        ) : (
          <span className="ladder-bar" style={{ left: `${left}%`, width: `${width}%` }} />
        )}
      </span>
      <span className="ladder-delta">{isMarker ? "" : formatNumber(step.to - step.from, 2, true)}</span>
    </li>
  );
}

function LadderAxis({ domain, threshold }: { domain: Domain; threshold: number }) {
  const thresholdAt = position(logit(threshold), domain);
  // Drop ticks outside the range or close enough to the threshold rule to collide with it.
  const ticks = TICKS.filter((p) => {
    const at = position(logit(p), domain);
    return at > 0 && at < 100 && Math.abs(at - thresholdAt) > 6;
  });
  return (
    <div className="ladder-axis" aria-hidden="true">
      <span className="ladder-axis-track">
        {ticks.map((p) => (
          <span key={p} className={`ladder-tick${MINOR_TICKS.has(p) ? " is-minor" : ""}`} style={{ left: `${position(logit(p), domain)}%` }}>
            {tickLabel(p)}
          </span>
        ))}
        <span className="ladder-threshold-label">Flagged above {formatPercent(threshold)}</span>
      </span>
    </div>
  );
}
