// ─── SkyFarm AI Insight Route ─────────────────────────────────────────────────
// Proxies requests to OpenAI so the API key never touches the browser.
// POST /api/ai-insight
//   Body: { page: 'water' | 'nutrient' | 'global' | 'analyze', data: { ...metrics } }

const express = require("express");
const axios = require("axios");
const router = express.Router();

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const API_KEY = process.env.OPENAI_API_KEY;

/* ─── System prompt ──────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert precision-agriculture advisor
powered by satellite remote sensing, XGBoost spectral analysis, and agronomy science.
You provide concise, actionable, data-driven field solutions in 3–5 bullet points.
Each bullet starts with an emoji, is 1–2 sentences, and references the specific metric values provided.
Always end with one "📅 Next step" bullet.
Use plain language a farmer can act on. Be specific with quantities (kg/ha, mm, days).
Do NOT repeat the metric values back verbatim in a list — weave them into natural solutions.`;

/* ─── Prompt builders per page ───────────────────────────────────────────── */
function buildPrompt(page, data) {
  switch (page) {
    case "water":
      return `Analyse the following water stress data for a ${data.crop || "General"} crop field:
- Water stress score: ${data.stressScore}% (${data.level})
- Soil moisture: ${data.soilMoisture}%
- Yellow pixels (chlorosis): ${data.yellowRatio}%
- Wilting pixels: ${data.wiltRatio}%
- Brown/scorched pixels: ${data.brownRatio}%
- Healthy pixels: ${data.healthyRatio}%
- Crop growth stage: ${data.stage || "unknown"}
- Rainfall last 7 days: ${data.rainfall ?? "unknown"} mm
- Scheduled irrigation: ${data.nextIrrigation || "not set"}

Provide targeted irrigation and crop management solution.`;

    case "nutrient":
      return `Analyse the following nutrient deficiency data for a ${data.crop || "General"} crop:
- Overall nutrient status: ${data.overallStatus}
- Deficiencies detected: ${JSON.stringify(data.deficiencies)}
- Yellow ratio (N proxy): ${data.yellowRatio}%
- Purple ratio (P proxy): ${data.purpleRatio}%
- Brown/edge scorch (K proxy): ${data.brownRatio}%
- Pale green (Mg/Fe proxy): ${data.paleRatio}%
- NDVI (vegetation health): ${data.ndvi ?? "unknown"}
- Crop: ${data.crop || "General"}

Provide specific fertiliser application and soil management solution.`;

    case "global":
      return `Analyse the following field data from a GPS-located plot:
- Location: lat ${data.lat}, lon ${data.lon}
- Stress: ${data.stressPct}% (${data.alertLevel})
- NDVI: ${data.ndvi} | NDRE: ${data.ndre} | MSI: ${data.msi}
- Soil moisture: ${data.soilMoisture}%
- Crop: ${data.crop || "General"}
- Season: ${data.season || "unknown"}
- Weather risk flags: ${data.weatherFlags || "none"}

Provide global operations centre solution covering immediate actions and 7-day outlook.`;

    case "analyze":
      return `Analyse the following satellite field analysis results:
- Crop: ${data.cropName || "General"} | Area: ${data.fieldArea || "?"} ha
- XGBoost AI stress score: ${data.xgbScore}/100
- Stress level: ${data.stressPercentage}% (${data.alertLevel})
- Confidence: ${data.confidence}%
- NDVI: ${data.ndvi} | NDRE: ${data.ndre} | GNDVI: ${data.gndvi} | CHL: ${data.chl}
- MSI: ${data.msi} | CWSI: ${data.cwsi} | TCI: ${data.tci} | EVI: ${data.evi}
- Soil moisture: ${data.soilMoisture}%
- Yellow: ${data.yellowRatio}% | Brown: ${data.brownRatio}%
- Estimated yield: ${data.yieldEst} t/ha (−${data.yieldLoss}% loss)
- Carbon sequestration: ${data.carbonSeq} t CO₂/ha

Provide precision field solution using XGBoost AI insights and all 9 spectral indices.`;

    default:
      return `Provide general agronomy solution based on: ${JSON.stringify(data)}`;
  }
}

/* ─── POST /api/ai-insight ───────────────────────────────────────────────── */
router.post("/", async (req, res) => {
  const { page, data } = req.body;

  if (!API_KEY) {
    return res
      .status(503)
      .json({ error: "OpenAI API key not configured on server." });
  }
  if (!page || !data) {
    return res
      .status(400)
      .json({ error: "Missing required fields: page, data" });
  }

  const userPrompt = buildPrompt(page, data);

  try {
    const response = await axios.post(
      OPENAI_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.55,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      },
    );

    const text = response.data.choices?.[0]?.message?.content?.trim() || "";
    const usage = response.data.usage || {};

    return res.json({
      solution: text,
      model: response.data.model,
      usage,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message =
      err.response?.data?.error?.message ||
      err.message ||
      "OpenAI request failed";
    console.error(`[ai-insight] OpenAI error (${status}):`, message);
    return res.status(status).json({ error: message });
  }
});

module.exports = router;
