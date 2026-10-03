import { useMemo } from "react";
import type { BatchResult, ScoredRow } from "../hooks/useBatchScoring";
import { downloadCsv, type Tally, tally, topRisks } from "../lib/batch";
import { formatAmount, formatCount, formatPercent } from "../lib/format";
import { DecisionTag } from "./DecisionTag";

const TOP_N = 25;

export function BatchResults({ result, onReset }: { result: BatchResult; onReset: () => void }) {
  const t = useMemo(() => tally(result.rows), [result]);
  const total = result.rows.length;

  return (
    <div className="batch-results">
      <h2 className="section-title">
        Flagged {formatCount(t.flagged)} of {formatCount(total)} transactions ({formatPercent(t.flagged / total)})
      </h2>
      {result.skipped > 0 && (
        <p className="hint">{formatCount(result.skipped)} rows were skipped because they had empty or non-numeric values.</p>
      )}
      {result.hasLabels && <LabelComparison tally={t} />}
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={() => downloadCsv(result)}>
          Download results
        </button>
        <button type="button" className="btn btn-secondary" onClick={onReset}>
          Check another file
        </button>
      </div>
      <TopRisks rows={result.rows} hasLabels={result.hasLabels} />
    </div>
  );
}

// Errors are highlighted only when there are some.
const badIf = (count: number) => (count > 0 ? "is-bad" : undefined);

function LabelComparison({ tally: t }: { tally: Tally }) {
  const frauds = t.caught + t.missed;
  return (
    <div className="comparison">
      <table className="matrix">
        <caption>Decisions compared with the file's Class labels</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">Flagged</th>
            <th scope="col">Not flagged</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Real fraud</th>
            <td className="is-good">{formatCount(t.caught)} caught</td>
            <td className={badIf(t.missed)}>{formatCount(t.missed)} missed</td>
          </tr>
          <tr>
            <th scope="row">Legitimate</th>
            <td className={badIf(t.falseAlarms)}>{formatCount(t.falseAlarms)} false alarms</td>
            <td className="is-good">{formatCount(t.cleared)} cleared</td>
          </tr>
        </tbody>
      </table>
      <p className="body-copy">
        Caught {frauds ? formatPercent(t.caught / frauds) : "none"} of the frauds.{" "}
        {t.flagged ? `${formatPercent(t.caught / t.flagged)} of flags were real fraud.` : ""} If the file includes rows
        the model was trained on (creditcard.csv does), these numbers look better than real-world performance.
      </p>
    </div>
  );
}

function TopRisks({ rows, hasLabels }: { rows: ScoredRow[]; hasLabels: boolean }) {
  const top = useMemo(() => topRisks(rows, TOP_N), [rows]);
  return (
    <div className="table-scroll">
      <table className="ledger">
        <caption>Highest-risk {formatCount(top.length)} transactions</caption>
        <thead>
          <tr>
            <th scope="col" className="num">Row</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col" className="num">Fraud chance</th>
            <th scope="col">Decision</th>
            {hasLabels && <th scope="col">Actual</th>}
          </tr>
        </thead>
        <tbody>
          {top.map((row) => (
            <tr key={row.line}>
              <td className="num">{formatCount(row.line)}</td>
              <td className="num">{formatAmount(row.amount)}</td>
              <td className="num">{formatPercent(row.probability)}</td>
              <td><DecisionTag flagged={row.flagged} /></td>
              {hasLabels && <td>{row.label === 1 ? "Fraud" : row.label === 0 ? "Legitimate" : "Unknown"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

