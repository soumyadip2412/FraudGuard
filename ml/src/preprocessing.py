import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, RobustScaler

from ml.src.data import TARGET

PCA_FEATURES = [f"V{i}" for i in range(1, 29)]
AMOUNT = "Amount"
TIME = "Time"

# Raw Time is seconds since the first transaction in this dataset, so its values
# mean nothing for new transactions. It is excluded unless hour features are enabled.
FEATURES = PCA_FEATURES + [AMOUNT]


def hour_features(X):
    """Turn Time (seconds) into a cyclical relative hour so 23:00 and 00:00 end up close."""
    hours = (np.asarray(X, dtype=float).ravel() / 3600) % 24
    angle = 2 * np.pi * hours / 24
    return np.column_stack([np.sin(angle), np.cos(angle)])


def hour_feature_names(_transformer, _input_features):
    return np.array(["hour_sin", "hour_cos"])


def input_columns(use_hour=False):
    return FEATURES + [TIME] if use_hour else list(FEATURES)


def validate_input(X, use_hour=False):
    missing = set(input_columns(use_hour)) - set(X.columns)
    if missing:
        raise ValueError(f"Missing feature columns: {sorted(missing)}")
    # XGBoost would silently treat NaN as a learned "missing" branch; reject it instead.
    if X[input_columns(use_hour)].isna().any().any():
        raise ValueError("Feature columns contain missing values")
    if (X[AMOUNT] < 0).any():
        raise ValueError("Amount must be non-negative")


def get_xy(df, use_hour=False):
    validate_input(df, use_hour)
    X = df[input_columns(use_hour)]
    y = df[TARGET] if TARGET in df else None
    return X, y


def build_preprocessor(use_hour=False):
    """Column-wise preprocessing; fit on the training split only.

    - Amount: log1p to remove the heavy right skew, then RobustScaler.
    - V1-V28: RobustScaler (median/IQR), so the extreme values that carry fraud
      signal are kept rather than clipped, and they don't distort the scaling.
      Tree models are unaffected by scaling; linear models need it.
    - Time (optional): cyclical hour features.
    """
    amount_pipeline = Pipeline([
        ("log", FunctionTransformer(np.log1p, feature_names_out="one-to-one")),
        ("scale", RobustScaler()),
    ])

    transformers = [
        ("pca", RobustScaler(), PCA_FEATURES),
        ("amount", amount_pipeline, [AMOUNT]),
    ]
    if use_hour:
        transformers.append(
            ("hour", FunctionTransformer(hour_features, feature_names_out=hour_feature_names), [TIME])
        )

    preprocessor = ColumnTransformer(
        transformers,
        remainder="drop",
        verbose_feature_names_out=False,
    )
    preprocessor.set_output(transform="pandas")
    return preprocessor


if __name__ == "__main__":
    from ml.src.data import load_splits

    train, val, test = load_splits()
    for use_hour in (False, True):
        X_train, y_train = get_xy(train, use_hour)
        X_test, _ = get_xy(test, use_hour)

        preprocessor = build_preprocessor(use_hour).fit(X_train)
        Xt = preprocessor.transform(X_test)

        print(f"\nuse_hour={use_hour}: {X_test.shape} -> {Xt.shape}")
        print("features:", list(Xt.columns[:3]), "...", list(Xt.columns[-3:]))
        print("NaNs:", int(Xt.isna().sum().sum()))
        print(Xt[["V1", "V14", AMOUNT]].describe().loc[["mean", "50%", "min", "max"]].round(2))
