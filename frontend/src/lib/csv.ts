import Papa from "papaparse";
import type { Features } from "../types";

export interface ParsedRow {
  line: number; // 1-based data row number, for pointing people back to their file
  features: Features;
  label: 0 | 1 | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  missing: string[];
  skipped: number;
  hasLabels: boolean;
}

const LABEL = "Class";

// creditcard.csv column order, used when a pasted row has no header.
const datasetColumns = (features: string[]) => ["Time", ...features, LABEL];

const isHeaderRow = (cells: string[]) => cells.some((cell) => cell.trim() !== "" && Number.isNaN(Number(cell)));

/**
 * Turns CSV rows into feature rows one at a time, so a large file never has to be
 * held in memory as text or as a table of strings: only the numeric rows are kept.
 */
class TransactionReader {
  private readonly rows: ParsedRow[] = [];
  private index: Map<string, number> | null = null;
  private missing: string[] = [];
  private skipped = 0;
  private features: string[];

  constructor(features: string[]) {
    this.features = features;
  }

  push(cells: string[]): void {
    if (this.index === null) {
      const hasHeader = isHeaderRow(cells);
      const header = hasHeader ? cells.map((cell) => cell.trim()) : this.positionalHeader(cells);
      this.index = new Map(header.map((name, i) => [name, i]));
      this.missing = this.features.filter((name) => !this.index!.has(name));
      if (hasHeader) return; // otherwise the first row is data too
    }
    if (this.missing.length === 0) this.addRow(cells);
  }

  result(): ParseResult {
    if (this.missing.length > 0 || this.index === null) {
      return { rows: [], missing: this.index ? this.missing : this.features, skipped: 0, hasLabels: false };
    }
    return { rows: this.rows, missing: [], skipped: this.skipped, hasLabels: this.index.has(LABEL) };
  }

  private positionalHeader(cells: string[]): string[] {
    return cells.length === this.features.length ? this.features : datasetColumns(this.features);
  }

  private addRow(cells: string[]): void {
    const values: Features = {};
    for (const name of this.features) {
      const cell = cells[this.index!.get(name)!];
      const value = Number(cell);
      if (cell === undefined || cell.trim() === "" || !Number.isFinite(value)) {
        this.skipped += 1;
        return;
      }
      values[name] = value;
    }
    const rawLabel = this.index!.has(LABEL) ? Number(cells[this.index!.get(LABEL)!]) : NaN;
    const label = rawLabel === 0 || rawLabel === 1 ? rawLabel : null;
    this.rows.push({ line: this.rows.length + this.skipped + 1, features: values, label });
  }
}

/** Why a file or row can't be used, without listing all 29 columns when none match. */
export function describeMissing(source: string, missing: string[], features: string[]): string {
  if (missing.length === features.length) {
    return `${source} doesn't look like transaction data: it needs a header row with V1 to V28 and Amount.`;
  }
  const shown = missing.length > 5 ? `${missing.slice(0, 5).join(", ")} and ${missing.length - 5} more` : missing.join(", ");
  return `${source} is missing these columns: ${shown}.`;
}

/** Parse pasted CSV text; accepts a header row or creditcard.csv column order. */
export function parseTransactions(text: string, features: string[]): ParseResult {
  const reader = new TransactionReader(features);
  Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, step: ({ data }) => reader.push(data) });
  return reader.result();
}

/** Stream a CSV file row by row (Papa reads it in chunks, yielding to the page between them). */
export function parseTransactionFile(file: File, features: string[]): Promise<ParseResult> {
  const reader = new TransactionReader(features);
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      step: ({ data }) => reader.push(data),
      complete: () => resolve(reader.result()),
      error: (error) => reject(new Error(`Couldn't read ${file.name}: ${error.message}`)),
    });
  });
}
