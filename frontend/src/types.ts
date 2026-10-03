// Mirrors the response schemas in app/schemas/prediction.py.

export type Features = Record<string, number>;

// The one feature with real-world meaning; V1-V28 are anonymised.
export const AMOUNT = "Amount";

export interface Contribution {
  feature: string;
  value: number;
  contribution: number;
}

export interface Prediction {
  fraud_probability: number;
  is_fraud: boolean;
  threshold: number;
  model: string;
  base_value: number | null;
  top_features: Contribution[] | null;
}

export interface StoredTransaction extends Prediction {
  id: number;
  created_at: string;
  amount: number;
}

export interface TransactionPage {
  total: number;
  items: StoredTransaction[];
}

export interface ModelInfo {
  model: string;
  imbalance_strategy: string | null;
  threshold: number;
  features: string[];
  trained_at: string | null;
  test_metrics: Record<string, number>;
  max_batch_size: number;
}
