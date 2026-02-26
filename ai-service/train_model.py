"""
train_model.py — SkyFarm Orbital Agronomy
Trains a RandomForestClassifier on synthetic spectral data.
Saves: model.joblib, scaler.joblib

Feature vector (per pixel):
  [NDVI, NDRE, MSI, z_score, NIR, Red, RedEdge, SWIR]

Classes:
  0 = healthy
  1 = stressed
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib
import os

# ─── Reproducibility ──────────────────────────────────────────────────────────
np.random.seed(42)

N_SAMPLES = 8000  # synthetic per-pixel samples

# ─── Generate synthetic spectral features ─────────────────────────────────────
def generate_synthetic_dataset(n_samples):
    """
    Simulate realistic Sentinel-2 band reflectance values for
    healthy and stressed pixels, then compute spectral indices.
    """
    n_healthy  = n_samples // 2
    n_stressed = n_samples - n_healthy

    # ── Healthy pixels ──────────────────────────────────────────────────────
    # High NIR, low Red → high NDVI; moderate SWIR → low MSI
    NIR_h      = np.random.normal(0.45, 0.06, n_healthy)
    Red_h      = np.random.normal(0.07, 0.02, n_healthy)
    RedEdge_h  = np.random.normal(0.30, 0.04, n_healthy)
    SWIR_h     = np.random.normal(0.20, 0.05, n_healthy)

    # ── Stressed pixels ─────────────────────────────────────────────────────
    # Lower NIR (chlorophyll decline), higher Red (less absorption),
    # lower RedEdge (N-deficiency pattern), higher SWIR (water stress)
    NIR_s      = np.random.normal(0.28, 0.07, n_stressed)
    Red_s      = np.random.normal(0.16, 0.04, n_stressed)
    RedEdge_s  = np.random.normal(0.18, 0.04, n_stressed)
    SWIR_s     = np.random.normal(0.38, 0.07, n_stressed)

    # Stack
    NIR      = np.concatenate([NIR_h,     NIR_s])
    Red      = np.concatenate([Red_h,     Red_s])
    RedEdge  = np.concatenate([RedEdge_h, RedEdge_s])
    SWIR     = np.concatenate([SWIR_h,    SWIR_s])

    # Clip to physically valid [0, 1]
    NIR     = np.clip(NIR,     0.01, 1.0)
    Red     = np.clip(Red,     0.01, 1.0)
    RedEdge = np.clip(RedEdge, 0.01, 1.0)
    SWIR    = np.clip(SWIR,    0.01, 1.0)

    # ── Spectral indices ─────────────────────────────────────────────────────
    eps  = 1e-8
    NDVI  = (NIR - Red)     / (NIR + Red     + eps)   # [-1, 1]
    NDRE  = (NIR - RedEdge) / (NIR + RedEdge + eps)   # Red-Edge NDVI
    MSI   = SWIR / (NIR + eps)                         # Moisture Stress Index (↑ = more stressed)

    # Z-score anomaly: deviation of NDVI from a "healthy" mean
    ndvi_mean  = np.mean(NDVI[:n_healthy])
    ndvi_std   = np.std(NDVI[:n_healthy]) + eps
    z_score    = (NDVI - ndvi_mean) / ndvi_std          # negative = declining

    # Feature matrix
    X = np.column_stack([NDVI, NDRE, MSI, z_score, NIR, Red, RedEdge, SWIR])
    y = np.array([0] * n_healthy + [1] * n_stressed)

    return X, y

# ─── Train ─────────────────────────────────────────────────────────────────────
print("🌱 Generating synthetic Sentinel-2 spectral dataset...")
X, y = generate_synthetic_dataset(N_SAMPLES)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Standardize features
scaler  = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test  = scaler.transform(X_test)

print(f"📊 Training set: {X_train.shape[0]} | Test set: {X_test.shape[0]}")
print("🤖 Training RandomForestClassifier...")

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=12,
    min_samples_split=4,
    min_samples_leaf=2,
    class_weight='balanced',
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train)

# ─── Evaluate ──────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
acc    = accuracy_score(y_test, y_pred)
print(f"\n✅ Accuracy: {acc * 100:.2f}%")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=['Healthy', 'Stressed']))

# Feature importance
feature_names = ['NDVI', 'NDRE', 'MSI', 'z_score', 'NIR', 'Red', 'RedEdge', 'SWIR']
importances   = model.feature_importances_
print("\n📈 Feature Importances:")
for name, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
    print(f"  {name:12s}: {imp:.4f}")

# ─── Save artefacts ────────────────────────────────────────────────────────────
os.makedirs('models', exist_ok=True)
joblib.dump(model,  'models/model.joblib')
joblib.dump(scaler, 'models/scaler.joblib')
print("\n💾 Saved: models/model.joblib, models/scaler.joblib")
print("🚀 AI model ready for inference!")
