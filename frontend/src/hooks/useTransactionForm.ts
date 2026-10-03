import { useState } from "react";
import { AMOUNT, type Features } from "../types";

const blank = (features: string[]) => Object.fromEntries(features.map((name) => [name, ""]));

const listOf = (names: string[]) => (names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", "));

/**
 * Form values are kept as strings (what inputs hold) and converted only on submit.
 * originalAmount is set when a whole record is loaded (example or pasted row), so an edited
 * amount can be shown as a what-if against the record's own amount.
 */
export function useTransactionForm(features: string[]) {
  const [values, setValues] = useState<Record<string, string>>(() => blank(features));
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);

  const setField = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const fill = (source: Features) => {
    setValues(Object.fromEntries(features.map((name) => [name, name in source ? String(source[name]) : ""])));
    setOriginalAmount(AMOUNT in source ? source[AMOUNT] : null);
  };
  const clear = () => {
    setValues(blank(features));
    setOriginalAmount(null);
  };
  const resetAmount = () => originalAmount !== null && setField(AMOUNT, String(originalAmount));
  const amountIsWhatIf = originalAmount !== null && Number(values[AMOUNT]) !== originalAmount;

  /** The features as numbers, or a message saying what to fix. */
  function toFeatures(): Features | string {
    const empty = features.filter((name) => values[name].trim() === "");
    if (empty.length === features.length) return "Pick an example, paste a dataset row, or fill in the advanced fields first.";
    if (empty.includes(AMOUNT)) return "Enter a transaction amount.";
    if (empty.length > 0) {
      return `Some anonymised model features are empty (${listOf(empty)}). Pick an example, paste a row, or fill them in under Advanced.`;
    }

    const result: Features = {};
    for (const name of features) {
      const value = Number(values[name]);
      if (!Number.isFinite(value)) return name === AMOUNT ? "The amount must be a number." : `An anonymised model feature (${name}) must be a number.`;
      result[name] = value;
    }
    return result;
  }

  return { features, values, setField, fill, clear, toFeatures, originalAmount, amountIsWhatIf, resetAmount };
}

export type TransactionFormState = ReturnType<typeof useTransactionForm>;
