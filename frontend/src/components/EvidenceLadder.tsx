import type { CSSProperties } from "react";
import { formatNumber, formatPercent, logit, sigmoid } from "../lib/format";

// Probabilities marked on the axis; "minor" ones are hidden on narrow screens.
const TICKS = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 0.5, 0.9, 0.99, 0.999];
const MINOR_TICKS = new Set([1e-5, 1e-3, 0.1, 0.9, 0.999]);
// A remainder smaller than this (log-odds) is rounding, not an unexplained contribution.
const REST_TOLERANCE = 0.01;

type Kind = "start" | "up" | "down" | "end";
type Domain = [number, number];

interface Row {
  key: string;
  label: string;
  detail: string;
  from: number;
  to: number;
  kind: Kind;
  deltaText?: string;
}

export interface LadderStep {
  key: string;
  label: string;
  detail: string;
  contribution: number; // SHAP, log-odds
  deltaText?: string; // shown instead of the signed number (e.g. "strong" in the default view)
}

export interface LadderInput {
  label: string; // accessible name of the list
  baseValue: number;
  steps: LadderStep[];
  probability: number;
  threshold: number;
  restLabel?: string; // label for whatever the steps don't cover, if anything is left
}

/** SHAP contributions are additive in log-odds, so the steps walk from the base value to the result. */
function buildRows({ baseValue, steps, probability, restLabel }: LadderInput): Row[] {
  const rows: Row[] = [
    { key: "start", label: "Typical transaction", detail: formatPercent(sigmoid(baseValue)), from: baseValue, to: baseValue, kind: "start" },
  ];
  let x = baseValue;
  for (const { key, label, detail, contribution, deltaText } of steps) {
    rows.push({ key, label, detail, from: x, to: x + contribution, kind: contribution >= 0 ? "up" : "down", deltaText });
    x += contribution;
  }
  const final = logit(probability);
  if (Math.abs(final - x) > REST_TOLERANCE) {
    rows.push({ key: "rest", label: restLabel ?? "Everything else", detail: "combined", from: x, to: final, kind: final >= x ? "up" : "down" });
  }
  rows.push({ key: "end", label: "This transaction", detail: formatPercent(probability), from: final, to: final, kind: "end" });
  return rows;
}

function domainFor(rows: Row[], threshold: number): Domain {
  const xs = rows.flatMap((row) => [row.from, row.to]).concat(logit(threshold));
  return [Math.min(...xs) - 1, Math.max(...xs) + 1];
}

const position = (x: number, [lo, hi]: Domain) => ((x - lo) / (hi - lo)) * 100;
const tickLabel = (p: number) => `${Number((p * 100).toPrecision(3))}%`;

export function EvidenceLadder({ input }: { input: LadderInput }) {
  const rows = buildRows(input);
  const domain = domainFor(rows, input.threshold);
  const style = { "--threshold": `${position(logit(input.threshold), domain)}%` } as CSSProperties;

  return (
    <figure className="ladder" style={style}>
      <ol className="ladder-rows" aria-label={input.label}>
        {rows.map((row, index) => (
          <LadderRow key={row.key} row={row} index={index} domain={domain} />
        ))}
      </ol>
      <LadderAxis domain={domain} threshold={input.threshold} />
    </figure>
  );
}

function LadderRow({ row, index, domain }: { row: Row; index: number; domain: Domain }) {
  const isMarker = row.kind === "start" || row.kind === "end";
  const left = position(Math.min(row.from, row.to), domain);
  const width = Math.max(Math.abs(position(row.to, domain) - position(row.from, domain)), 0.5);

  return (
    <li className={`ladder-row is-${row.kind}`} style={{ "--i": index } as CSSProperties}>
      <span className="ladder-label">
        {row.label}
        <span className="ladder-detail">{row.detail}</span>
      </span>
      <span className="ladder-track" aria-hidden="true">
        {isMarker ? (
          <span className="ladder-marker" style={{ left: `${left}%` }} />
        ) : (
          <span className="ladder-bar" style={{ left: `${left}%`, width: `${width}%` }} />
        )}
      </span>
      <span className="ladder-delta">{isMarker ? "" : (row.deltaText ?? formatNumber(row.to - row.from, 2, true))}</span>
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
