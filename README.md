# Orbital Agronomy — Stress-Vision™
### Pre-Visual Crop Stress Detection via Multispectral Satellite AI

> **Hackathon Project** · MERN + FastAPI · SDG 2: Zero Hunger  
> Detects water stress and nutrient deficiency **10–21 days before visible yellowing**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React + Vite)                        │
│  Home · Dashboard · Stress-Vision · Analyze Field · Alert Center     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST (fetch)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│               Node.js + Express Backend  :5000                       │
│  POST /api/analyze/field  ── Multer upload (.tif / image)            │
│  GET  /api/history        ── paginated MongoDB query                 │
│  Mongoose ──► MongoDB Atlas / localhost:27017/skyfarm                │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ axios (multipart / JSON)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│               FastAPI AI Microservice  :8000                         │
│  POST /analyze        ── image file → spectral indices → RF model   │
│  POST /analyze-coords ── lat/lon → synthetic field → same pipeline  │
│                                                                      │
│  Pipeline:                                                           │
│   rasterio  ──► band extraction (NIR, Red, RedEdge, SWIR)           │
│   numpy     ──► NDVI, NDRE, MSI, CWSI, z-score anomaly              │
│   scikit-learn ─► RandomForestClassifier → per-pixel stress prob    │
│   OpenCV    ──► COLORMAP_JET heatmap + addWeighted overlay          │
│   base64    ──► PNG overlay returned to Node backend                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Spectral Indices

| Index | Formula | What it detects |
|-------|---------|-----------------|
| **NDVI**  | (NIR−Red)/(NIR+Red)       | General vegetation health |
| **NDRE**  | (NIR−RedEdge)/(NIR+RedEdge) | N-deficiency, chlorophyll (earlier than NDVI) |
| **MSI**   | SWIR/NIR                  | Moisture stress (canopy water content) |
| **CWSI**  | Thermal proxy via MSI     | Crop water stress index |
| **Z-Score** | (NDVI − μ) / σ         | Anomaly pixel detection |

---

## Project Structure

```
skyfarm/
├── src/                        ← React frontend (existing SkyFarm UI)
│   ├── pages/
│   │   ├── AnalyzeField.jsx    ← NEW: .tif upload + GPS analyze UI
│   │   ├── Home.jsx
│   │   ├── Dashboard.jsx
│   │   ├── StressView.jsx
│   │   ├── AlertCenter.jsx
│   │   └── Pipeline.jsx
│   ├── components/
│   │   ├── Navbar.jsx          ← Emergency alert ticker + Analyze link
│   │   └── ImageSlider.jsx
│   └── utils/data.js
│
├── backend/                    ← Node.js + Express + MongoDB
│   ├── server.js
│   ├── routes/
│   │   ├── analysis.js         ← POST /api/analyze/field
│   │   └── history.js          ← GET /api/history
│   ├── models/FieldAnalysis.js ← Mongoose schema
│   ├── middleware/upload.js    ← Multer config
│   └── .env
│
├── ai-service/                 ← Python FastAPI
│   ├── main.py                 ← FastAPI app + spectral pipeline
│   ├── train_model.py          ← RandomForest training script
│   ├── requirements.txt
│   └── models/                 ← model.joblib + scaler.joblib (after training)
│
├── public/                     ← img1–5.jpg (slideshow)
├── index.html
├── package.json
└── README.md
```

---

## Setup Instructions

### 1. Frontend (already running)
```bash
cd skyfarm
npm install
npm run dev
# Runs on http://localhost:5176
```

### 2. Backend
```bash
cd skyfarm/backend
npm install
# Ensure MongoDB is running (local or Atlas)
# Edit .env if needed
npm run dev
# Runs on http://localhost:5000
```

### 3. AI Microservice

**Prerequisites:** Python 3.10+
```bash
cd skyfarm/ai-service

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Train the model (generates models/model.joblib)
python train_model.py

# Start the service
uvicorn main:app --reload --port 8000
# Runs on http://localhost:8000
# Docs: http://localhost:8000/docs
```

---

## API Documentation

### POST `/api/analyze/field`
Accepts `.tif`, `.png`, `.jpg` via multipart OR `lat`/`lon` JSON.

**Request (file upload):**
```
Content-Type: multipart/form-data
Field: image (file), fieldName (string)
```

**Response:**
```json
{
  "success": true,
  "stressPercentage": 67.4,
  "alertLevel": "CRITICAL",
  "indices": { "ndvi": 0.32, "ndre": 0.21, "msi": 0.88, "cwsi": 0.29 },
  "overlayImage": "data:image/png;base64,...",
  "rgbImage": "data:image/png;base64,...",
  "ndviImage": "data:image/png;base64,...",
  "farmerAdvisory": "🚨 CRITICAL STRESS at 67.4%...",
  "smsTemplate": "[SkyFarm] 🚨 CRITICAL: ...",
  "forecast": [
    { "day": 1, "date": "2026-02-27", "stressIndex": 71, "alertLevel": "CRITICAL", "recommendation": "..." },
    ...
  ],
  "processingTimeMs": 842
}
```

### GET `/api/history?limit=20&skip=0`
Returns paginated historical analyses.

### GET `/api/history/:id`
Full record including base64 images.

---

## Alert Levels
| Level | Stress % | Action |
|-------|----------|--------|
| ✅ SAFE | 0–30% | Monitor every 5 days |
| ⚠️ MONITOR | 30–60% | Irrigate within 48h, apply foliar N |
| 🚨 CRITICAL | 60%+ | Irrigate within 24h, contact agronomist |

---

## Deployment

### Render (Backend + AI Service)
```bash
# Backend: Create Web Service → Root Dir: backend/ → Start: node server.js
# AI: Create Web Service → Root Dir: ai-service/ → Start: uvicorn main:app --host 0.0.0.0 --port $PORT
# Set MONGO_URI, AI_SERVICE_URL env vars in Render dashboard
```

### Vercel (Frontend)
```bash
# Root dir: skyfarm/
# Set VITE_API_URL=https://your-backend.onrender.com/api
vercel --prod
```

---

## Hackathon Pitch Script

> "Every year, 40% of crop yield is lost to stress that could have been detected weeks earlier.
> 
> **SkyFarm** uses Sentinel-2 hyperspectral satellite data and a RandomForest AI model to detect water stress and nitrogen deficiency **10–21 days before any visible yellowing** — in the invisible spectrum.
> 
> Our platform computes five spectral indices — NDVI, NDRE, MSI, CWSI, and z-score anomaly — per pixel, runs a RandomForestClassifier trained on 8,000 synthetic pixels, and overlays a Stress-Vision™ heatmap on the RGB satellite image.
> 
> Farmers receive:
> - An exact stress percentage and alert level (SAFE / MONITOR / CRITICAL)
> - A 7-day AI-simulated stress forecast
> - An actionable advisory with irrigation and nitrogen recommendations
> - An SMS-ready alert template for instant field communication
> 
> The entire pipeline runs in under 1 second per image.
> This is precision agriculture for the 21st century. This is SkyFarm."

---

*Built for UN SDG 2: Zero Hunger · Team CreXter · ENIGMA 2.0 Hackathon*
