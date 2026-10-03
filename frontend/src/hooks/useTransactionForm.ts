import { useState } from "react";
import type { Features } from "../types";

const blank = (features: string[]) => Object.fromEntries(features.map((name) => [name, ""]));

/** Form values are kept as strings (what inputs hold) and converted only on submit. */
export function useTransactionForm(features: string[]) {
  const [values, setValues] = useState<Record<string, string>>(() => blank(features));

  const setField = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const fill = (source: Features) =>
    setValues(Object.fromEntries(features.map((name) => [name, name in source ? String(source[name]) : ""])));
  const clear = () => setValues(blank(features));

  /** The features as numbers, or a message saying what to fix. */
  function toFeatures(): Features | string {
    const empty = features.filter((name) => values[name].trim() === "");
    if (empty.length === features.length) return "Fill in the form or pick an example first.";
    if (empty.length > 0) return `Fill in ${empty.join(", ")} before checking.`;

    const result: Features = {};
    for (const name of features) {
      const value = Number(values[name]);
      if (!Number.isFinite(value)) return `${name} must be a number.`;
      result[name] = value;
    }
    return result;
  }

  return { features, values, setField, fill, clear, toFeatures };
}

export type TransactionFormState = ReturnType<typeof useTransactionForm>;
