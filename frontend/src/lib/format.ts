const MINUS = "−";

export function formatPercent(probability: number): string {
  const pct = probability * 100;
  if (pct === 0 || pct === 100) return `${pct}%`;
  if (pct < 0.01) return "<0.01%";
  if (pct > 99.99) return ">99.99%";
  if (pct < 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

const amountFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat();
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

// The dataset doesn't state a currency, so amounts are shown without a symbol.
export const formatAmount = (amount: number) => amountFormat.format(amount);
export const formatCount = (count: number) => countFormat.format(count);
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** Fixed decimals with a true minus sign; signed adds "+" to non-negative values. */
export function formatNumber(value: number, digits = 2, signed = false): string {
  const text = Math.abs(value).toFixed(digits);
  if (value < 0) return `${MINUS}${text}`;
  return signed ? `+${text}` : text;
}

// Log-odds <-> probability. SHAP values for XGBoost are in log-odds.
export function logit(probability: number): number {
  const p = Math.min(Math.max(probability, 1e-9), 1 - 1e-9);
  return Math.log(p / (1 - p));
}

export const sigmoid = (logOdds: number) => 1 / (1 + Math.exp(-logOdds));

const MODEL_NAMES: Record<string, string> = { xgboost: "XGBoost", logreg: "Logistic regression" };
export const modelName = (id: string) => MODEL_NAMES[id] ?? id;
