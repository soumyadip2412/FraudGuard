import type { BatchResult, ScoredRow } from "../hooks/useBatchScoring";

export interface Tally {
  flagged: number;
  caught: number; // real fraud, flagged
  missed: number; // real fraud, not flagged
  falseAlarms: number; // legitimate, flagged
  cleared: number; // legitimate, not flagged
}

export function tally(rows: ScoredRow[]): Tally {
  const t: Tally = { flagged: 0, caught: 0, missed: 0, falseAlarms: 0, cleared: 0 };
  for (const { flagged, label } of rows) {
    if (flagged) t.flagged += 1;
    if (label === 1) {
      if (flagged) t.caught += 1;
      else t.missed += 1;
    } else if (label === 0) {
      if (flagged) t.falseAlarms += 1;
      else t.cleared += 1;
    }
  }
  return t;
}

/** The n highest-probability rows, in one pass instead of sorting every row. */
export function topRisks(rows: ScoredRow[], n: number): ScoredRow[] {
  const top: ScoredRow[] = [];
  for (const row of rows) {
    if (top.length === n && row.probability <= top[n - 1].probability) continue;
    const at = top.findIndex((other) => row.probability > other.probability);
    top.splice(at === -1 ? top.length : at, 0, row);
    if (top.length > n) top.pop();
  }
  return top;
}

export function downloadCsv(result: BatchResult) {
  const columns = (r: ScoredRow) => [r.line, r.amount, r.probability, r.flagged ? 1 : 0, ...(result.hasLabels ? [r.label ?? ""] : [])];
  const header = ["row", "amount", "fraud_probability", "flagged", ...(result.hasLabels ? ["class"] : [])].join(",");
  const body = result.rows.map((row) => columns(row).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([header, "\n", body], { type: "text/csv" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `scored-${result.fileName}` });
  link.click();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
