from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "creditcard.csv"
TARGET = "Class"
RANDOM_STATE = 42


def load_raw(path=DATA_PATH):
    df = pd.read_csv(path)

    expected = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount", TARGET]
    if list(df.columns) != expected:
        raise ValueError(f"Unexpected columns: {list(df.columns)}")
    if df.isna().any().any():
        raise ValueError("Dataset contains missing values")
    if not set(df[TARGET].unique()) <= {0, 1}:
        raise ValueError(f"{TARGET} must be 0/1")

    return df


def drop_duplicates(df):
    # Same features with different labels would mean dropping a row changes the
    # ground truth, so fail loudly instead of silently picking one.
    features = df.columns.drop(TARGET)
    conflicts = df.groupby(list(features))[TARGET].nunique()
    if (conflicts > 1).any():
        raise ValueError(f"{(conflicts > 1).sum()} feature-identical groups have conflicting labels")

    before = len(df)
    df = df.drop_duplicates(keep="first").reset_index(drop=True)
    print(f"Dropped {before - len(df)} duplicate rows ({before} -> {len(df)})")
    return df


def split(df, strategy="stratified", val_size=0.15, test_size=0.15):
    """Split into train/val/test.

    stratified: random split that keeps the fraud rate equal in every set (default).
    time: earliest rows train, latest rows test, to measure performance on "future" data.
    """
    if strategy == "stratified":
        train_val, test = train_test_split(
            df, test_size=test_size, stratify=df[TARGET], random_state=RANDOM_STATE
        )
        train, val = train_test_split(
            train_val,
            test_size=val_size / (1 - test_size),
            stratify=train_val[TARGET],
            random_state=RANDOM_STATE,
        )
    elif strategy == "time":
        df = df.sort_values("Time", kind="stable")
        n = len(df)
        train_end = int(n * (1 - val_size - test_size))
        val_end = int(n * (1 - test_size))
        train, val, test = df.iloc[:train_end], df.iloc[train_end:val_end], df.iloc[val_end:]
    else:
        raise ValueError(f"Unknown split strategy: {strategy}")

    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


def load_splits(strategy="stratified"):
    return split(drop_duplicates(load_raw()), strategy=strategy)


def summarize(name, df):
    print(
        f"{name:<6} rows={len(df):>7}  fraud={int(df[TARGET].sum()):>4}  "
        f"rate={df[TARGET].mean():.4%}  time=[{df['Time'].min():.0f}, {df['Time'].max():.0f}]"
    )


if __name__ == "__main__":
    df = drop_duplicates(load_raw())
    for strategy in ("stratified", "time"):
        print(f"\n--- {strategy} ---")
        for name, part in zip(("train", "val", "test"), split(df, strategy=strategy)):
            summarize(name, part)
