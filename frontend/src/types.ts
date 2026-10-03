// Mirrors the response schemas in app/schemas/prediction.py.

export type Features = Record<string, number>;

// The one feature with real-world meaning; V1-V28 are anonymised.
export const AMOUNT = "Amount";

export interface Contribution {
  feature: string;
  value: number;
  contribution: number;
}

export type Direction = "raised" | "lowered" | "unchanged";
export type Strength = "negligible" | "slight" | "moderate" | "strong";

/** Mirrors ExplanationOut in app/schemas/prediction.py. */
export interface Explanation {
  amount: {
    value: number;
    percentile: number;
    contribution: number;
    direction: Direction;
    odds_multiplier: number;
    strength: Strength;
  };
  anonymised: {
    combined_contribution: number;
    direction: Direction;
    odds_multiplier: number;
    strength: Strength;
    raised_count: number;
    lowered_count: number;
    extreme_count: number;
  };
  unusualness: {
    percentile: number;
    comparison_group: string;
    extreme_feature_count: number;
    rarity_threshold: number;
    summary: string;
  };
  technical: {
    base_value: number;
    top_features: (Contribution & { odds_multiplier: number; percentile: number })[];
    feature_percentiles: Record<string, number>;
  };
  reference: {
    dataset_description: string;
    model_version: string;
  };
}

export interface Prediction {
  fraud_probability: number;
  is_fraud: boolean;
  threshold: number;
  model: string;
  base_value: number | null;
  top_features: Contribution[] | null;
  // Absent from older API versions, with ?explain=false, and on transactions recorded before it existed.
  explanation?: Explanation | null;
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
