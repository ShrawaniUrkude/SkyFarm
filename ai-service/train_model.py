"""
train_model.py — SkyFarm Orbital Agronomy
Trains both a RandomForestClassifier and an XGBoostClassifier on synthetic
spectral data, compares accuracy, and saves the best-performing model.

Saves:
  models/model.joblib        — best model (RF or XGB)
  models/scaler.joblib       — StandardScaler
  models/rf_model.joblib     — RandomForest (always saved)
  models/xgb_model.joblib    — XGBoost     (always saved)
  models/model_meta.json     — model type, accuracy, feature importances

Feature vector (per pixel):
  [NDVI, NDRE, MSI, GNDVI, CHL, z_score, NIR, Red, Green, RedEdge, SWIR, EVI]

Classes:
  0 = healthy
  1 = stressed
"""

import json
import os

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier

    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("⚠️  xgboost not installed — pip install xgboost   (skipping XGB)")

import joblib

# ─── Reproducibility ──────────────────────────────────────────────────────────
np.random.seed(42)

N_SAMPLES = 12_000  # synthetic per-pixel samples
FEATURE_NAMES = [
    "NDVI",
    "NDRE",
    "MSI",
    "GNDVI",
    "CHL",
    "z_score",
    "NIR",
    "Red",
    "Green",
    "RedEdge",
    "SWIR",
    "EVI",
]


# ─── Generate synthetic spectral features ─────────────────────────────────────
def generate_synthetic_dataset(n_samples: int):
    """
    Simulate realistic Sentinel-2 band reflectance values for healthy,
    moderately-stressed, and severely-stressed pixels, then derive
    an extended set of spectral indices.
    """
    n_healthy = n_samples // 3
    n_moderate = n_samples // 3
    n_severe = n_samples - n_healthy - n_moderate

    def band(mu_h, mu_m, mu_s, sd, n_h, n_m, n_s):
        return np.concatenate(
            [
                np.random.normal(mu_h, sd, n_h),
                np.random.normal(mu_m, sd * 1.1, n_m),
                np.random.normal(mu_s, sd * 1.2, n_s),
            ]
        )

    # ── Raw bands (Sentinel-2 style reflectance) ──────────────────────────
    NIR = band(0.46, 0.35, 0.24, 0.06, n_healthy, n_moderate, n_severe)
    Red = band(0.07, 0.13, 0.20, 0.02, n_healthy, n_moderate, n_severe)
    Green = band(0.12, 0.10, 0.08, 0.02, n_healthy, n_moderate, n_severe)
    RedEdge = band(0.31, 0.22, 0.15, 0.04, n_healthy, n_moderate, n_severe)
    SWIR = band(0.19, 0.30, 0.42, 0.05, n_healthy, n_moderate, n_severe)

    # Clip to [0.01, 1]
    NIR = np.clip(NIR, 0.01, 1.0)
    Red = np.clip(Red, 0.01, 1.0)
    Green = np.clip(Green, 0.01, 1.0)
    RedEdge = np.clip(RedEdge, 0.01, 1.0)
    SWIR = np.clip(SWIR, 0.01, 1.0)

    # ── Spectral indices ──────────────────────────────────────────────────
    eps = 1e-8
    NDVI = (NIR - Red) / (NIR + Red + eps)
    NDRE = (NIR - RedEdge) / (NIR + RedEdge + eps)
    MSI = SWIR / (NIR + eps)
    GNDVI = (NIR - Green) / (NIR + Green + eps)  # Green NDVI
    CHL = (NIR / RedEdge) - 1.0  # Red-Edge Chlorophyll
    EVI = 2.5 * (NIR - Red) / (NIR + 6 * Red - 7.5 * 0.02 + 1 + eps)

    # Z-score anomaly (healthy reference)
    ndvi_mean = np.mean(NDVI[:n_healthy])
    ndvi_std = np.std(NDVI[:n_healthy]) + eps
    z_score = (NDVI - ndvi_mean) / ndvi_std

    # Add realistic sensor noise
    noise = lambda a: a + np.random.normal(0, 0.005, a.shape)
    NDVI, NDRE, MSI, GNDVI = noise(NDVI), noise(NDRE), noise(MSI), noise(GNDVI)

    X = np.column_stack(
        [NDVI, NDRE, MSI, GNDVI, CHL, z_score, NIR, Red, Green, RedEdge, SWIR, EVI]
    )
    # Binary labels: 0 = healthy, 1 = stressed (moderate+severe)
    y = np.array([0] * n_healthy + [1] * (n_moderate + n_severe))

    return X, y


# ─── Dataset ──────────────────────────────────────────────────────────────────
print("🌱  Generating synthetic Sentinel-2 spectral dataset…")
X, y = generate_synthetic_dataset(N_SAMPLES)
print(
    f"     Samples: {len(X)} | Features: {X.shape[1]} | "
    f"Healthy: {(y==0).sum()} | Stressed: {(y==1).sum()}"
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

print(f"\n📊  Training set: {X_train.shape[0]:,} | Test set: {X_test.shape[0]:,}")

# ─── RandomForest ─────────────────────────────────────────────────────────────
print("\n🌲  Training RandomForestClassifier…")
rf = RandomForestClassifier(
    n_estimators=300,
    max_depth=14,
    min_samples_split=4,
    min_samples_leaf=2,
    max_features="sqrt",
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
rf.fit(X_train, y_train)
rf_pred = rf.predict(X_test)
rf_acc = accuracy_score(y_test, rf_pred)
rf_auc = roc_auc_score(y_test, rf.predict_proba(X_test)[:, 1])
print(f"   ✅ RF  Accuracy : {rf_acc * 100:.2f}%  |  ROC-AUC: {rf_auc:.4f}")

# ─── XGBoost ──────────────────────────────────────────────────────────────────
xgb_acc, xgb_auc = 0.0, 0.0
xgb = None
if HAS_XGB:
    print("\n⚡  Training XGBoostClassifier…")
    xgb = XGBClassifier(
        n_estimators=400,
        max_depth=7,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.5,
        scale_pos_weight=(y_train == 0).sum() / (y_train == 1).sum(),
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    xgb.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    xgb_pred = xgb.predict(X_test)
    xgb_acc = accuracy_score(y_test, xgb_pred)
    xgb_auc = roc_auc_score(y_test, xgb.predict_proba(X_test)[:, 1])
    print(f"   ✅ XGB Accuracy : {xgb_acc * 100:.2f}%  |  ROC-AUC: {xgb_auc:.4f}")

# ─── Cross-validation (5-fold on best model so far) ──────────────────────────
best_base = xgb if (HAS_XGB and xgb_acc >= rf_acc) else rf
best_name = "XGBoost" if (HAS_XGB and xgb_acc >= rf_acc) else "RandomForest"
cv_scores = cross_val_score(
    best_base,
    np.vstack([X_train, X_test]),
    np.concatenate([y_train, y_test]),
    cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
    scoring="accuracy",
    n_jobs=-1,
)
print(
    f"\n🔁  5-Fold CV ({best_name}): {cv_scores.mean()*100:.2f}% ± {cv_scores.std()*100:.2f}%"
)

# ─── Ensemble (VotingClassifier) ──────────────────────────────────────────────
if HAS_XGB:
    print("\n🤝  Training Ensemble (RF + XGBoost soft voting)…")
    # VotingClassifier needs fresh (un-transformed) estimators, but we already
    # have scaled data so we use pre-fitted ones via predict_proba manually.
    rf_proba = rf.predict_proba(X_test)[:, 1]
    xgb_proba = xgb.predict_proba(X_test)[:, 1]
    ens_proba = (rf_proba + xgb_proba) / 2
    ens_pred = (ens_proba >= 0.5).astype(int)
    ens_acc = accuracy_score(y_test, ens_pred)
    ens_auc = roc_auc_score(y_test, ens_proba)
    print(f"   ✅ Ensemble Accuracy: {ens_acc * 100:.2f}%  |  ROC-AUC: {ens_auc:.4f}")

# ─── Select best model ────────────────────────────────────────────────────────
candidate_acc = {
    "RandomForest": rf_acc,
}
if HAS_XGB:
    candidate_acc["XGBoost"] = xgb_acc
    candidate_acc["Ensemble"] = ens_acc  # ensemble uses RF+XGB, save best single

best_model_name = max(candidate_acc, key=candidate_acc.get)
best_acc = candidate_acc[best_model_name]

if best_model_name == "XGBoost":
    best_model = xgb
elif best_model_name == "RandomForest":
    best_model = rf
else:
    # Ensemble ≈ XGBoost in accuracy; prefer XGBoost for single-model deployment
    best_model = xgb
    best_model_name = "XGBoost (Ensemble Best)"

print(f"\n🏆  Best model: {best_model_name}  ({best_acc*100:.2f}%)")

# ─── Full classification report ───────────────────────────────────────────────
print("\nClassification Report (best model):")
print(
    classification_report(
        y_test, best_model.predict(X_test), target_names=["Healthy", "Stressed"]
    )
)

# ─── Feature importances ──────────────────────────────────────────────────────
importances = best_model.feature_importances_
print("📈  Feature Importances:")
sorted_feats = sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1])
for name, imp in sorted_feats:
    bar = "█" * int(imp * 200)
    print(f"  {name:12s} {imp:.4f}  {bar}")

# ─── Save artefacts ───────────────────────────────────────────────────────────
os.makedirs("models", exist_ok=True)
joblib.dump(rf, "models/rf_model.joblib")
joblib.dump(scaler, "models/scaler.joblib")
joblib.dump(best_model, "models/model.joblib")

meta = {
    "best_model": best_model_name,
    "best_accuracy": round(best_acc * 100, 2),
    "rf_accuracy": round(rf_acc * 100, 2),
    "rf_roc_auc": round(rf_auc, 4),
    "feature_names": FEATURE_NAMES,
    "feature_importances": {n: round(float(i), 4) for n, i in sorted_feats},
    "cv_mean": round(float(cv_scores.mean()) * 100, 2),
    "cv_std": round(float(cv_scores.std()) * 100, 2),
}
if HAS_XGB:
    joblib.dump(xgb, "models/xgb_model.joblib")
    meta["xgb_accuracy"] = round(xgb_acc * 100, 2)
    meta["xgb_roc_auc"] = round(xgb_auc, 4)
    meta["ensemble_accuracy"] = round(ens_acc * 100, 2)
    print("💾  Saved: models/xgb_model.joblib")

with open("models/model_meta.json", "w") as f:
    json.dump(meta, f, indent=2)

print("💾  Saved: models/model.joblib  models/rf_model.joblib")
print("💾  Saved: models/scaler.joblib  models/model_meta.json")

# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "─" * 56)
print(f" Model          │ Accuracy │  ROC-AUC")
print("─" * 56)
print(f" RandomForest   │  {rf_acc*100:6.2f}%  │  {rf_auc:.4f}")
if HAS_XGB:
    print(f" XGBoost        │  {xgb_acc*100:6.2f}%  │  {xgb_auc:.4f}")
    print(f" Ensemble       │  {ens_acc*100:6.2f}%  │  {ens_auc:.4f}")
print("─" * 56)
print(
    f" 5-Fold CV ({best_name[:3]:}…) │  {cv_scores.mean()*100:.2f}% ± {cv_scores.std()*100:.2f}%"
)
print("─" * 56)
print("\n🚀  SkyFarm AI (XGBoost + RF Ensemble) is ready for inference!")
