"""
spectral.py
-----------
Compute remote-sensing spectral indices from multispectral satellite imagery.

Assumed 6-band layout (Sentinel-2 style):
  Band 0 - Blue
  Band 1 - Green
  Band 2 - Red
  Band 3 - Red Edge
  Band 4 - NIR
  Band 5 - SWIR
"""

import numpy as np


# ---------------------------------------------------------------------------
#  Helper
# ---------------------------------------------------------------------------

def _safe_divide(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    """Element-wise division; returns 0 wherever the denominator is zero."""
    with np.errstate(divide="ignore", invalid="ignore"):
        result = np.where(np.abs(denominator) > 1e-10, numerator / denominator, 0.0)
    return result.astype(np.float32)


# ---------------------------------------------------------------------------
#  Spectral index functions
# ---------------------------------------------------------------------------

def compute_ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Normalized Difference Vegetation Index  (NIR - Red) / (NIR + Red)."""
    return _safe_divide(nir - red, nir + red)


def compute_ndre(nir: np.ndarray, red_edge: np.ndarray) -> np.ndarray:
    """Normalized Difference Red-Edge Index  (NIR - RedEdge) / (NIR + RedEdge)."""
    return _safe_divide(nir - red_edge, nir + red_edge)


def compute_msi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Moisture Stress Index  SWIR / NIR  (higher => more water stress)."""
    return _safe_divide(swir, nir)


def compute_zscore_anomaly(index_map: np.ndarray) -> np.ndarray:
    """
    Absolute z-score anomaly map  |x - mu| / sigma.
    Returns zeros when the field standard deviation is effectively zero.
    """
    flat = index_map.flatten()
    mu = float(np.nanmean(flat))
    sigma = float(np.nanstd(flat))
    if sigma < 1e-9:
        return np.zeros_like(index_map, dtype=np.float32)
    return np.abs((index_map - mu) / sigma).astype(np.float32)


# ---------------------------------------------------------------------------
#  Feature stack builder
# ---------------------------------------------------------------------------

def build_feature_stack(bands: dict):
    """
    Build a flat (N, 6) feature matrix from a 6-band dictionary.

    Parameters
    ----------
    bands : dict
        Keys: 'blue', 'green', 'red', 'red_edge', 'nir', 'swir'
        Values: 2-D float32 arrays of identical shape (H, W).

    Returns
    -------
    feature_array : np.ndarray, shape (H*W, 6)
        Column order: [ndvi, ndre, msi, zscore_ndvi, nir, swir]
    shape : tuple  (H, W)
    index_maps : dict
        Keys: 'ndvi', 'ndre', 'msi', 'zscore_ndvi'
    """
    nir      = bands["nir"].astype(np.float32)
    red      = bands["red"].astype(np.float32)
    red_edge = bands["red_edge"].astype(np.float32)
    swir     = bands["swir"].astype(np.float32)

    ndvi        = compute_ndvi(nir, red)
    ndre        = compute_ndre(nir, red_edge)
    msi         = compute_msi(swir, nir)
    zscore_ndvi = compute_zscore_anomaly(ndvi)

    h, w = nir.shape

    feature_array = np.stack(
        [ndvi.ravel(), ndre.ravel(), msi.ravel(), zscore_ndvi.ravel(),
         nir.ravel(), swir.ravel()],
        axis=1,
    ).astype(np.float32)

    index_maps = {
        "ndvi":        ndvi,
        "ndre":        ndre,
        "msi":         msi,
        "zscore_ndvi": zscore_ndvi,
    }

    return feature_array, (h, w), index_maps
