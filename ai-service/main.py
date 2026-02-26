"""
main.py — SkyFarm FastAPI AI Microservice
Endpoints:
  POST /analyze         — accept uploaded .tif / image file
  POST /analyze-coords  — accept lat/lon (simulates field data)
  GET  /health          — service health check
"""

import io
import os
import base64
import logging
import time
from typing import Optional

import numpy as np
import cv2
import joblib
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scipy import stats

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("skyfarm-ai")

# ─── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="SkyFarm AI Microservice",
    description="Per-pixel crop stress detection using RandomForest on Sentinel-2 spectral indices",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Load Model + Scaler ───────────────────────────────────────────────────────
MODEL_PATH  = os.path.join(os.path.dirname(__file__), "models", "model.joblib")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "models", "scaler.joblib")

try:
    model  = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    log.info(f"✅ Model loaded from {MODEL_PATH}")
except FileNotFoundError:
    log.warning("⚠ Model not found — run train_model.py first. Using fallback simulation.")
    model  = None
    scaler = None

# ─── Pydantic schemas ─────────────────────────────────────────────────────────
class CoordsRequest(BaseModel):
    lat: float
    lon: float

# ─── Spectral Index Computation ────────────────────────────────────────────────
def compute_indices(NIR: np.ndarray, Red: np.ndarray,
                    RedEdge: np.ndarray, SWIR: np.ndarray) -> dict:
    """
    Compute per-pixel spectral stress indices.
    All inputs must be float arrays in range [0, 1].
    """
    eps = 1e-8

    # 1. NDVI = (NIR - Red) / (NIR + Red)
    #    Range [-1, 1]. Healthy > 0.5, stressed < 0.3
    NDVI = (NIR - Red) / (NIR + Red + eps)

    # 2. NDRE = (NIR - RedEdge) / (NIR + RedEdge)
    #    More sensitive to chlorophyll than NDVI; detects N-deficiency earlier
    NDRE = (NIR - RedEdge) / (NIR + RedEdge + eps)

    # 3. MSI = SWIR / NIR
    #    Moisture Stress Index — higher = more water stress (canopy dries out)
    MSI = SWIR / (NIR + eps)

    # 4. CWSI proxy: uses MSI (CWSI requires thermal; approximated here)
    #    CWSI ~ normalized MSI
    MSI_clamped = np.clip(MSI, 0.0, 3.0)
    CWSI = MSI_clamped / 3.0

    # 5. Z-score anomaly detection on NDVI
    #    Flags pixels that deviate significantly from the field mean
    ndvi_flat = NDVI.flatten()
    z_score   = stats.zscore(ndvi_flat).reshape(NDVI.shape)

    # ── Per-image scalar summaries ──────────────────────────────────────────
    return {
        "ndvi":    float(np.nanmean(NDVI)),
        "ndre":    float(np.nanmean(NDRE)),
        "msi":     float(np.nanmean(MSI)),
        "cwsi":    float(np.nanmean(CWSI)),
        "zScore":  float(np.nanmean(np.abs(z_score))),
        # Per-pixel arrays (numpy) — used downstream for heatmap
        "_NDVI_map":   NDVI,
        "_z_score_map": z_score,
        "_NDRE_map":   NDRE,
        "_MSI_map":    MSI,
    }

# ─── Stress Probability Map ────────────────────────────────────────────────────
def predict_stress_map(NDVI: np.ndarray, NDRE: np.ndarray,
                        MSI:  np.ndarray, z_score: np.ndarray,
                        NIR:  np.ndarray, Red:     np.ndarray,
                        RedEdge: np.ndarray, SWIR: np.ndarray) -> np.ndarray:
    """
    Per-pixel RandomForest inference.
    Returns stress probability map in [0, 1].
    """
    H, W = NDVI.shape
    features = np.column_stack([
        NDVI.flatten(),
        NDRE.flatten(),
        MSI.flatten(),
        z_score.flatten(),
        NIR.flatten(),
        Red.flatten(),
        RedEdge.flatten(),
        SWIR.flatten(),
    ])  # shape: (H*W, 8)

    if model is not None and scaler is not None:
        features_scaled = scaler.transform(features)
        stress_prob     = model.predict_proba(features_scaled)[:, 1]  # P(stressed)
    else:
        # Fallback: heuristic from NDVI alone
        stress_prob = np.clip(1 - NDVI.flatten(), 0, 1)

    return stress_prob.reshape(H, W)

# ─── Heatmap Generation ────────────────────────────────────────────────────────
def build_stress_heatmap(stress_map: np.ndarray) -> np.ndarray:
    """
    Convert scalar stress probability [0,1] to BGR heatmap:
      Blue  → Healthy  (prob < 0.30)
      Green → Low      (0.30–0.45)
      Yellow→ Moderate (0.45–0.60)
      Red   → Critical (>0.60)
    Uses OpenCV COLORMAP_JET for the full range.
    """
    # Scale to uint8 [0, 255]
    stress_uint8 = (stress_map * 255).astype(np.uint8)
    # Apply JET colormap (blue=low, red=high)
    heatmap_bgr = cv2.applyColorMap(stress_uint8, cv2.COLORMAP_JET)
    return heatmap_bgr

# ─── Overlay RGB + Heatmap ─────────────────────────────────────────────────────
def build_overlay(rgb_bgr: np.ndarray, heatmap_bgr: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    """
    Blend the RGB satellite image with the stress heatmap.
    alpha: weight of heatmap (0 = pure RGB, 1 = pure heatmap)
    """
    h_rgb = cv2.resize(rgb_bgr, (heatmap_bgr.shape[1], heatmap_bgr.shape[0]))
    overlay = cv2.addWeighted(h_rgb, 1 - alpha, heatmap_bgr, alpha, 0)
    return overlay

# ─── Image → base64 ────────────────────────────────────────────────────────────
def bgr_to_base64(bgr_img: np.ndarray) -> str:
    _, buf = cv2.imencode(".png", bgr_img)
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()

# ─── Alert Level ───────────────────────────────────────────────────────────────
def classify_alert(stress_pct: float) -> str:
    if stress_pct < 30:   return "SAFE"
    if stress_pct < 60:   return "MONITOR"
    return "CRITICAL"

# ─── Core Analysis Function ────────────────────────────────────────────────────
def run_analysis(image_bytes: bytes) -> dict:
    """
    Full pipeline:
    1. Decode image → simulate multi-band split
    2. Compute spectral indices (NDVI, NDRE, MSI, CWSI, z-score)
    3. RandomForest per-pixel inference → stress probability map
    4. Heatmap generation + RGB overlay
    5. Return structured result
    """
    t0 = time.time()

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    bgr   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if bgr is None:
        # Try PIL fallback (handles .tif)
        from PIL import Image as PILImage
        pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    H, W = bgr.shape[:2]

    # ── Simulate Sentinel-2 multi-band decomposition ─────────────────────────
    # Real: use rasterio.open().read([4,3,2,8,5,11]) for an actual .tif
    # Here we derive pseudo-bands from the RGB image to support any input format
    float_bgr = bgr.astype(np.float32) / 255.0
    B_ch, G_ch, R_ch = float_bgr[:,:,0], float_bgr[:,:,1], float_bgr[:,:,2]

    # Pseudo-band derivation (spectral simulation from RGB + noise)
    rng     = np.random.default_rng(seed=int(np.mean(bgr)))         # deterministic seed per image
    NIR     = np.clip(G_ch * 1.4 + rng.normal(0, 0.04, (H, W)), 0, 1)
    Red     = np.clip(R_ch       + rng.normal(0, 0.02, (H, W)), 0, 1)
    RedEdge = np.clip((G_ch * 0.7 + NIR * 0.3) + rng.normal(0, 0.03, (H, W)), 0, 1)
    SWIR    = np.clip(R_ch * 0.6 + B_ch * 0.2  + rng.normal(0, 0.04, (H, W)), 0, 1)

    # ── Spectral indices ──────────────────────────────────────────────────────
    indices = compute_indices(NIR, Red, RedEdge, SWIR)

    # ── Per-pixel stress prediction ───────────────────────────────────────────
    stress_map = predict_stress_map(
        indices["_NDVI_map"], indices["_NDRE_map"],
        indices["_MSI_map"],  indices["_z_score_map"],
        NIR, Red, RedEdge, SWIR,
    )

    # ── Stress percentage ─────────────────────────────────────────────────────
    stress_pct = float(np.mean(stress_map) * 100)

    # ── Heatmap + Overlay ─────────────────────────────────────────────────────
    heatmap = build_stress_heatmap(stress_map)
    overlay = build_overlay(bgr, heatmap, alpha=0.5)

    # ── NDVI visualisation ────────────────────────────────────────────────────
    ndvi_raw = indices["_NDVI_map"]
    ndvi_vis = np.clip((ndvi_raw + 1) / 2.0 * 255, 0, 255).astype(np.uint8)
    ndvi_bgr = cv2.applyColorMap(ndvi_vis, cv2.COLORMAP_RdYlGn)

    # ── Remove internal numpy arrays before returning ─────────────────────────
    scalar_indices = {k: v for k, v in indices.items() if not k.startswith("_")}

    return {
        "stress_percentage": round(stress_pct, 2),
        "alert_level":       classify_alert(stress_pct),
        "indices":           scalar_indices,
        "overlay_image":     bgr_to_base64(overlay),
        "rgb_image":         bgr_to_base64(bgr),
        "ndvi_image":        bgr_to_base64(ndvi_bgr),
        "processing_ms":     round((time.time() - t0) * 1000, 1),
    }

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":       "ok",
        "model_loaded": model is not None,
        "service":      "skyfarm-ai",
    }


@app.post("/analyze")
async def analyze_field_image(file: UploadFile = File(...)):
    """Accept an uploaded .tif / image and run the full AI pipeline."""
    allowed = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}
    ext     = os.path.splitext(file.filename)[-1].lower()

    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    try:
        image_bytes = await file.read()
        log.info(f"Received file: {file.filename} ({len(image_bytes)/1024:.1f} KB)")
        result = run_analysis(image_bytes)
        log.info(f"Analysis complete: stress={result['stress_percentage']}%, alert={result['alert_level']}")
        return result
    except Exception as e:
        log.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze-coords")
async def analyze_field_coords(body: CoordsRequest):
    """
    Accept lat/lon coordinates.
    In production: query Copernicus STAC for Sentinel-2 tile, crop to bbox, analyze.
    Here: generate synthetic field image at the given coordinates.
    """
    lat, lon = body.lat, body.lon
    log.info(f"Coords analysis: lat={lat}, lon={lon}")

    try:
        # Generate a synthetic 256x256 "field" image seeded by coordinates
        rng = np.random.default_rng(int(abs(lat * 1000) + abs(lon * 1000)))
        field = rng.integers(30, 200, (256, 256, 3), dtype=np.uint8)
        # Encode to bytes
        _, buf = cv2.imencode(".png", field)
        result = run_analysis(buf.tobytes())
        result["source"] = {"lat": lat, "lon": lon}
        return result
    except Exception as e:
        log.error(f"Coords analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
