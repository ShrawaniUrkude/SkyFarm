"""
train_model.py
--------------
Standalone training script: generates synthetic multispectral scenes,
extracts spectral features, trains an XGBoost classifier (with RandomForest
fallback), and saves artefacts for the inference service.

Saved artefacts
---------------
model.joblib        -- trained classifier
demo_field.tif      -- first synthetic scene as a 6-band GeoTIFF (EPSG:4326)
model_metrics.json  -- accuracy + ROC-AUC reported on the held-out test set

Synthetic data parameters
-------------------------
- 20 scenes of 256x256 pixels
- 4 crop types: wheat, rice, cotton, sugarcane
- 3 stress types: drought, nutrient, pest
- Spectral reflectance profiles based on realistic Sentinel-2 values
- Perlin-like spatial anomalies via scipy.ndimage.zoom
"""

import json
import os

import joblib
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from scipy.ndimage import zoom
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

try:
    from xgboost import XGBClassifier
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("xgboost not available – falling back to RandomForest")

from spectral import build_feature_stack

np.random.seed(42)

# ---------------------------------------------------------------------------
#  Crop spectral profiles  (mu, sigma) per band for each class
#  Band order: [blue, green, red, red_edge, nir, swir]
# ---------------------------------------------------------------------------
CROP_PROFILES = {
    "wheat":     {"mu": [0.05, 0.10, 0.07, 0.25, 0.42, 0.22], "sigma": [0.008, 0.010, 0.008, 0.020, 0.030, 0.018]},
    "rice":      {"mu": [0.04, 0.09, 0.06, 0.22, 0.45, 0.18], "sigma": [0.007, 0.009, 0.007, 0.018, 0.028, 0.015]},
    "cotton":    {"mu": [0.06, 0.11, 0.08, 0.28, 0.50, 0.25], "sigma": [0.009, 0.011, 0.009, 0.022, 0.035, 0.020]},
    "sugarcane": {"mu": [0.05, 0.12, 0.07, 0.24, 0.48, 0.20], "sigma": [0.008, 0.010, 0.008, 0.020, 0.032, 0.017]},
}

# Stress signatures: fractional shift applied to pixels under stress
STRESS_SHIFTS = {
    "drought":  [+0.02, -0.03, +0.05, -0.06, -0.12, +0.10],
    "nutrient": [+0.01, -0.02, +0.03, -0.08, -0.10, +0.06],
    "pest":     [+0.03, -0.04, +0.06, -0.05, -0.09, +0.08],
}

N_SCENES  = 20
SCENE_H   = 256
SCENE_W   = 256
STRESS_FRACTION = 0.35   # ~35% of each scene is stressed


def perlin_noise(h: int, w: int, scale: float = 0.08) -> np.ndarray:
    """Generate smooth spatial noise via bicubic zoom of white noise."""
    low_h = max(2, int(h * scale))
    low_w = max(2, int(w * scale))
    raw   = np.random.rand(low_h, low_w).astype(np.float32)
    zoom_h = h / low_h
    zoom_w = w / low_w
    smooth = zoom(raw, (zoom_h, zoom_w), order=3)
    # ensure exact shape
    smooth = smooth[:h, :w]
    if smooth.shape != (h, w):
        smooth = np.pad(smooth, ((0, h - smooth.shape[0]), (0, w - smooth.shape[1])))
    mn, mx = smooth.min(), smooth.max()
    return (smooth - mn) / (mx - mn + 1e-8)


def generate_scene(crop: str, stress_type: str, h: int = SCENE_H, w: int = SCENE_W):
    """
    Return a (6, H, W) float32 array and a (H, W) binary label mask.
    Label 0 = healthy, 1 = stressed.
    """
    profile = CROP_PROFILES[crop]
    mu      = np.array(profile["mu"],    dtype=np.float32)
    sigma   = np.array(profile["sigma"], dtype=np.float32)
    shifts  = np.array(STRESS_SHIFTS[stress_type], dtype=np.float32)

    # Base healthy reflectance
    bands = np.random.normal(mu[:, None, None], sigma[:, None, None],
                             size=(6, h, w)).astype(np.float32)

    # Stress mask via Perlin-like noise
    noise    = perlin_noise(h, w)
    threshold = np.quantile(noise, 1.0 - STRESS_FRACTION)
    stress_mask = (noise >= threshold).astype(np.float32)

    # Apply stress spectral shift
    for b in range(6):
        bands[b] += stress_mask * shifts[b]

    bands = np.clip(bands, 0.01, 1.0)
    labels = stress_mask.astype(np.int32)
    return bands, labels


# ---------------------------------------------------------------------------
#  Generate all scenes
# ---------------------------------------------------------------------------
print(f"Generating {N_SCENES} synthetic scenes ({SCENE_H}x{SCENE_W})...")

crops        = list(CROP_PROFILES.keys())
stress_types = list(STRESS_SHIFTS.keys())
all_features, all_labels = [], []
first_scene_bands = None

for i in range(N_SCENES):
    crop   = crops[i % len(crops)]
    stress = stress_types[i % len(stress_types)]
    scene_bands, label_mask = generate_scene(crop, stress)

    if first_scene_bands is None:
        first_scene_bands = scene_bands

    band_dict = {
        "blue":     scene_bands[0],
        "green":    scene_bands[1],
        "red":      scene_bands[2],
        "red_edge": scene_bands[3],
        "nir":      scene_bands[4],
        "swir":     scene_bands[5],
    }

    features, shape, _ = build_feature_stack(band_dict)
    all_features.append(features)
    all_labels.append(label_mask.ravel())
    print(f"  Scene {i+1:02d}/{N_SCENES}  crop={crop:<10s}  stress={stress}")

X = np.vstack(all_features).astype(np.float32)
y = np.concatenate(all_labels).astype(np.int32)
print(f"Dataset: {X.shape[0]:,} pixels  |  stressed: {y.sum():,}  |  healthy: {(y==0).sum():,}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ---------------------------------------------------------------------------
#  Train
# ---------------------------------------------------------------------------
if HAS_XGB:
    print("Training XGBClassifier (n_estimators=300)...")
    clf = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    model_name = "XGBClassifier"
else:
    print("Training RandomForestClassifier (n_estimators=300)...")
    clf = RandomForestClassifier(
        n_estimators=300, max_depth=12, class_weight="balanced",
        random_state=42, n_jobs=-1
    )
    clf.fit(X_train, y_train)
    model_name = "RandomForestClassifier"

y_pred  = clf.predict(X_test)
y_proba = clf.predict_proba(X_test)[:, 1]
accuracy = float((y_pred == y_test).mean())
auc      = float(roc_auc_score(y_test, y_proba))

print(f"\nModel : {model_name}")
print(f"Accuracy : {accuracy * 100:.2f}%")
print(f"ROC-AUC  : {auc:.4f}")
print(classification_report(y_test, y_pred, target_names=["healthy", "stressed"]))

# ---------------------------------------------------------------------------
#  Save artefacts
# ---------------------------------------------------------------------------
_dir = os.path.dirname(os.path.abspath(__file__))

# 1) Model
model_path = os.path.join(_dir, "model.joblib")
joblib.dump(clf, model_path)
print(f"Saved: {model_path}")

# 2) demo_field.tif  (EPSG:4326, near Pune)
dem_path = os.path.join(_dir, "demo_field.tif")
west, south, east, north = 73.980, 18.490, 74.010, 18.520
transform = from_bounds(west, south, east, north, SCENE_W, SCENE_H)

with rasterio.open(
    dem_path, "w",
    driver="GTiff",
    height=SCENE_H, width=SCENE_W,
    count=6,
    dtype="float32",
    crs="EPSG:4326",
    transform=transform,
) as dst:
    for b in range(6):
        dst.write(first_scene_bands[b], b + 1)
print(f"Saved: {dem_path}")

# 3) model_metrics.json
metrics_path = os.path.join(_dir, "model_metrics.json")
metrics = {
    "model":    model_name,
    "accuracy": round(accuracy * 100, 2),
    "auc":      round(auc, 4),
    "n_scenes": N_SCENES,
    "scene_size": [SCENE_H, SCENE_W],
}
with open(metrics_path, "w") as f:
    json.dump(metrics, f, indent=2)
print(f"Saved: {metrics_path}")
print("\nTraining complete.")
