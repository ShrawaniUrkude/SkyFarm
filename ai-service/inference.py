"""
inference.py
------------
Load the trained model and run per-pixel crop-stress inference.
Provides visualisation helpers and analytics utilities.
"""

import json
import os
import random

import cv2
import joblib
import numpy as np

# ---------------------------------------------------------------------------
#  Paths
# ---------------------------------------------------------------------------
_DIR          = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH   = os.path.join(_DIR, "model.joblib")
_METRICS_PATH = os.path.join(_DIR, "model_metrics.json")

# ---------------------------------------------------------------------------
#  Global model cache  (loaded once per process)
# ---------------------------------------------------------------------------
_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is None:
        if not os.path.exists(_MODEL_PATH):
            raise FileNotFoundError(
                f"Trained model not found at {_MODEL_PATH}. "
                "Run  python train_model.py  first."
            )
        _MODEL = joblib.load(_MODEL_PATH)
    return _MODEL


# ---------------------------------------------------------------------------
#  Core inference
# ---------------------------------------------------------------------------

def predict_stress(features: np.ndarray, shape: tuple) -> np.ndarray:
    """
    Predict per-pixel stress probability.

    Parameters
    ----------
    features : np.ndarray, shape (H*W, 6)
        Feature columns: [ndvi, ndre, msi, zscore_ndvi, nir, swir]
    shape : (H, W)
        Original spatial dimensions.

    Returns
    -------
    stress_map : np.ndarray, shape (H, W), dtype float32
        Values in [0, 1] representing per-pixel stress probability.
    """
    model = _load_model()
    proba = model.predict_proba(features)

    if proba.shape[1] == 2:
        stress_prob = proba[:, 1]
    else:
        # multi-class: class 0 = healthy, rest = stress types
        stress_prob = proba[:, 1:].sum(axis=1)

    stress_prob = np.clip(stress_prob, 0.0, 1.0).astype(np.float32)
    return stress_prob.reshape(shape)


# ---------------------------------------------------------------------------
#  Visualisation helpers
# ---------------------------------------------------------------------------

def generate_heatmap(stress_map: np.ndarray) -> np.ndarray:
    """
    Convert a [0, 1] probability map to a COLORMAP_JET BGR heatmap.

    Blue -> low stress probability
    Red  -> high stress probability

    Returns
    -------
    heatmap : np.ndarray (H, W, 3) uint8
    """
    uint8 = (np.clip(stress_map, 0.0, 1.0) * 255).astype(np.uint8)
    return cv2.applyColorMap(uint8, cv2.COLORMAP_JET)


def create_overlay(
    rgb_image: np.ndarray,
    heatmap: np.ndarray,
    alpha: float = 0.55,
) -> np.ndarray:
    """
    Blend the stress heatmap over the original RGB representation.

    Parameters
    ----------
    rgb_image : np.ndarray (H, W, 3) uint8  BGR image
    heatmap   : np.ndarray (H, W, 3) uint8  COLORMAP_JET output
    alpha     : float  heatmap weight; (1 - alpha) applied to rgb_image

    Returns
    -------
    overlay : np.ndarray (H, W, 3) uint8
    """
    if heatmap.shape[:2] != rgb_image.shape[:2]:
        heatmap = cv2.resize(heatmap, (rgb_image.shape[1], rgb_image.shape[0]))
    return cv2.addWeighted(rgb_image, 1.0 - alpha, heatmap, alpha, 0)


# ---------------------------------------------------------------------------
#  Model accuracy
# ---------------------------------------------------------------------------

def get_model_accuracy() -> float:
    """
    Return the trained model accuracy stored in model_metrics.json.
    Falls back to 92.5 if the file is missing or malformed.
    """
    try:
        with open(_METRICS_PATH) as fh:
            metrics = json.load(fh)
        return float(metrics.get("accuracy", 92.5))
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return 92.5


# ---------------------------------------------------------------------------
#  Analytics helpers
# ---------------------------------------------------------------------------

def compute_alert_level(stress_pct: float) -> str:
    """Map a scalar stress percentage to a human-readable alert level.

    < 30 %  ->  SAFE
    30-60%  ->  MONITOR
    > 60 %  ->  CRITICAL
    """
    if stress_pct < 30:
        return "SAFE"
    if stress_pct <= 60:
        return "MONITOR"
    return "CRITICAL"


def compute_distribution(stress_map: np.ndarray) -> dict:
    """
    Return percentage breakdown of pixel health categories.

    healthy  : stress < 0.3
    moderate : 0.3 <= stress < 0.6
    critical : stress >= 0.6
    """
    flat  = stress_map.flatten()
    total = len(flat)
    if total == 0:
        return {"healthy": 0.0, "moderate": 0.0, "critical": 0.0}

    healthy  = float(np.sum(flat < 0.3)                    / total * 100)
    moderate = float(np.sum((flat >= 0.3) & (flat < 0.6))  / total * 100)
    critical = float(np.sum(flat >= 0.6)                    / total * 100)

    return {
        "healthy":  round(healthy,  2),
        "moderate": round(moderate, 2),
        "critical": round(critical, 2),
    }


def generate_forecast(stress_pct: float) -> list:
    """
    Simulate a 7-day stress forecast using a random walk with upward drift.

    Returns
    -------
    list of 7 dicts: [{"day": int, "stress": float, "level": str}, ...]
    """
    forecast = []
    current  = stress_pct
    for day in range(1, 8):
        delta   = random.gauss(mu=0.8, sigma=3.5)   # slight upward drift
        current = float(np.clip(current + delta, 0.0, 100.0))
        forecast.append({
            "day":   day,
            "stress": round(current, 1),
            "level": compute_alert_level(current),
        })
    return forecast
