"""
main.py
-------
FastAPI microservice for crop stress detection from multispectral GeoTIFF imagery.

Endpoint
--------
POST /analyze   -- accepts a 6-band .tif / .tiff upload and returns:
  - Base64-encoded RGB, NDVI, and overlay images
  - Stress analytics: percentage, distribution, forecast, alert level
  - Model accuracy and an advisory message
"""

import base64
import io
import os
import tempfile

import cv2
import numpy as np
import rasterio
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from inference import (
    compute_alert_level,
    compute_distribution,
    create_overlay,
    generate_forecast,
    generate_heatmap,
    get_model_accuracy,
    predict_stress,
)
from spectral import build_feature_stack

# ---------------------------------------------------------------------------
#  App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SkyFarm AI – Crop Stress Detection",
    description="Per-pixel stress inference on 6-band Sentinel-2 GeoTIFF imagery.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _encode_bgr_to_base64_png(bgr: np.ndarray) -> str:
    """Encode a BGR uint8 image to a base64 PNG data-URL string."""
    _, buf = cv2.imencode(".png", bgr)
    b64    = base64.b64encode(buf.tobytes()).decode()
    return f"data:image/png;base64,{b64}"


def _make_advisory(stress_pct: float, alert: str) -> str:
    """Dynamically generate a field advisory message."""
    if alert == "SAFE":
        return (
            f"Field stress is LOW at {stress_pct:.1f}%. Crop canopy appears healthy. "
            "Maintain current irrigation and nutrient schedules."
        )
    if alert == "MONITOR":
        return (
            f"Field stress is MODERATE at {stress_pct:.1f}%. "
            "Recommend soil moisture sampling and targeted scouting within 48 hours. "
            "Consider supplementary irrigation if no rainfall is forecast."
        )
    return (
        f"CRITICAL stress detected at {stress_pct:.1f}%. "
        "Immediate field inspection required. Check for drought, nutrient deficiency, "
        "or pest pressure. Apply corrective intervention within 24 hours."
    )


# ---------------------------------------------------------------------------
#  Endpoint
# ---------------------------------------------------------------------------

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accept a 6-band GeoTIFF and return stress analytics + visualisations.

    The uploaded file must have exactly 6 bands in the order:
    Blue, Green, Red, Red Edge, NIR, SWIR.
    """
    # ── Validate file extension ──────────────────────────────────────────────
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in {".tif", ".tiff"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Only .tif / .tiff are accepted.",
        )

    # ── Save to a temp file (rasterio needs a real path or file-like obj) ────
    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # ── Open with rasterio and extract bands ─────────────────────────────
        with rasterio.open(tmp_path) as src:
            if src.count != 6:
                raise HTTPException(
                    status_code=422,
                    detail=f"Expected exactly 6 bands; got {src.count}.",
                )
            b_blue     = src.read(1).astype(np.float32)
            b_green    = src.read(2).astype(np.float32)
            b_red      = src.read(3).astype(np.float32)
            b_red_edge = src.read(4).astype(np.float32)
            b_nir      = src.read(5).astype(np.float32)
            b_swir     = src.read(6).astype(np.float32)

    finally:
        os.unlink(tmp_path)

    band_dict = {
        "blue":     b_blue,
        "green":    b_green,
        "red":      b_red,
        "red_edge": b_red_edge,
        "nir":      b_nir,
        "swir":     b_swir,
    }

    # ── Build feature stack ──────────────────────────────────────────────────
    features, shape, index_maps = build_feature_stack(band_dict)

    # ── Per-pixel stress prediction ──────────────────────────────────────────
    stress_map = predict_stress(features, shape)

    # ── Analytics ────────────────────────────────────────────────────────────
    stress_pct   = float(np.mean(stress_map) * 100)
    alert        = compute_alert_level(stress_pct)
    distribution = compute_distribution(stress_map)
    forecast     = generate_forecast(stress_pct)
    accuracy     = get_model_accuracy()
    advisory     = _make_advisory(stress_pct, alert)

    # ── Build visualisations ─────────────────────────────────────────────────
    H, W = shape

    # 1) Pseudo-RGB  (scale reflectance to uint8)
    def _to_uint8(arr):
        mn, mx = arr.min(), arr.max()
        if mx - mn < 1e-8:
            return np.zeros_like(arr, dtype=np.uint8)
        return ((arr - mn) / (mx - mn) * 255).astype(np.uint8)

    r_u8 = _to_uint8(b_red)
    g_u8 = _to_uint8(b_green)
    b_u8 = _to_uint8(b_blue)
    rgb_bgr = cv2.merge([b_u8, g_u8, r_u8])   # OpenCV expects BGR

    # 2) NDVI green-colorisation
    ndvi_raw  = index_maps["ndvi"]
    ndvi_norm = np.clip((ndvi_raw + 1.0) / 2.0, 0, 1)
    ndvi_u8   = (ndvi_norm * 255).astype(np.uint8)
    # Green channel emphasis: (0, green, 0)
    ndvi_bgr  = cv2.merge([
        np.zeros_like(ndvi_u8),
        ndvi_u8,
        np.zeros_like(ndvi_u8),
    ])

    # 3) Heatmap overlay
    heatmap = generate_heatmap(stress_map)
    overlay = create_overlay(rgb_bgr, heatmap, alpha=0.55)

    # ── Encode to base64 PNG ─────────────────────────────────────────────────
    rgb_b64     = _encode_bgr_to_base64_png(rgb_bgr)
    ndvi_b64    = _encode_bgr_to_base64_png(ndvi_bgr)
    overlay_b64 = _encode_bgr_to_base64_png(overlay)

    return {
        # Images
        "rgb_image":     rgb_b64,
        "ndvi_image":    ndvi_b64,
        "overlay_image": overlay_b64,
        # Analytics
        "stress_percentage": round(stress_pct, 2),
        "alert_level":       alert,
        "distribution":      distribution,
        "forecast":          forecast,
        "model_accuracy":    accuracy,
        "advisory_message":  advisory,
        # Spectral summaries
        "indices": {
            "ndvi":        round(float(np.nanmean(index_maps["ndvi"])),        4),
            "ndre":        round(float(np.nanmean(index_maps["ndre"])),        4),
            "msi":         round(float(np.nanmean(index_maps["msi"])),         4),
            "zscore_ndvi": round(float(np.nanmean(index_maps["zscore_ndvi"])), 4),
        },
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "skyfarm-ai-v2"}
