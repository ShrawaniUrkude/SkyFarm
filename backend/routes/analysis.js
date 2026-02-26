// ─── Route: POST /api/analyze/field ─────────────────────────────────────────
//     Accepts: multipart/form-data (image file) OR JSON (coordinates)
//     Sends image to FastAPI microservice, stores result in MongoDB
const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const upload = require('../middleware/upload');
const FieldAnalysis = require('../models/FieldAnalysis');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ─── Helper: generate 7-day stress forecast ──────────────────────────────────
function buildForecast(baseStress) {
    const forecast = [];
    let stress = baseStress;
    const now = new Date();

    for (let i = 1; i <= 7; i++) {
        // Simulate stress trajectory: random walk with slight upward drift if already high
        const delta = (Math.random() - 0.42) * 8;
        stress = Math.min(100, Math.max(0, stress + delta));
        const s = Math.round(stress);

        const date = new Date(now);
        date.setDate(date.getDate() + i);

        let alertLevel, recommendation;
        if (s < 30) { alertLevel = 'SAFE'; recommendation = 'No action needed. Continue regular monitoring.'; }
        else if (s < 60) { alertLevel = 'MONITOR'; recommendation = 'Schedule soil moisture check within 48h. Consider light irrigation.'; }
        else { alertLevel = 'CRITICAL'; recommendation = '⚠ URGENT: Apply irrigation immediately. Inspect canopy for early chlorosis.'; }

        forecast.push({
            day: i,
            date: date.toISOString().slice(0, 10),
            stressIndex: s,
            alertLevel,
            recommendation,
        });
    }
    return forecast;
}

// ─── Helper: generate farmer advisory + SMS ───────────────────────────────────
function buildAdvisory(stressPct, alertLevel, indices) {
    const ndvi = indices?.ndvi?.toFixed(3) ?? 'N/A';
    const ndre = indices?.ndre?.toFixed(3) ?? 'N/A';
    const msi = indices?.msi?.toFixed(3) ?? 'N/A';

    let advisory = '';
    let sms = '';

    if (alertLevel === 'SAFE') {
        advisory = `✅ Your crop is currently HEALTHY with a stress index of ${stressPct}%. NDVI: ${ndvi} | NDRE: ${ndre} | MSI: ${msi}. No immediate action required. Continue routine monitoring every 5 days. Ensure adequate irrigation schedule is maintained.`;
        sms = `[SkyFarm] SAFE: Crop stress ${stressPct}%. No action needed. NDVI:${ndvi}. Next scan in 5d.`;
    } else if (alertLevel === 'MONITOR') {
        advisory = `⚠️ MODERATE STRESS detected at ${stressPct}%. NDVI: ${ndvi} (declining) | NDRE: ${ndre} | MSI: ${msi} (elevated = water stress). ACTION: 1) Schedule drip irrigation within 48h. 2) Apply 20kg/ha foliar nitrogen. 3) Re-scan in 3 days. Early intervention can prevent 30-40% yield loss.`;
        sms = `[SkyFarm] MONITOR: Crop stress ${stressPct}%. Schedule irrigation within 48h. NDVI:${ndvi}. Reply HELP for advisory.`;
    } else {
        advisory = `🚨 CRITICAL STRESS at ${stressPct}%! NDVI: ${ndvi} (severe decline) | NDRE: ${ndre} | MSI: ${msi} (critical water deficit). IMMEDIATE ACTIONS REQUIRED: 1) Apply 45mm deficit irrigation WITHIN 24 HOURS. 2) Soil moisture check at 0.4m depth. 3) Apply reflective kaolin clay to reduce canopy temp. 4) Contact agronomist. Estimated yield loss if untreated: 40-60%.`;
        sms = `[SkyFarm] 🚨 CRITICAL: Crop stress ${stressPct}%! Irrigate within 24h or face 40-60% yield loss. NDVI:${ndvi}. Call agronomist NOW.`;
    }

    return { advisory, sms };
}

// ─── POST /api/analyze/field — Upload .tif or raw image ─────────────────────
router.post('/field', upload.single('image'), async (req, res, next) => {
    const t0 = Date.now();

    try {
        const { fieldName = 'Unnamed Field', lat, lon } = req.body;

        if (!req.file && !lat) {
            return res.status(400).json({ error: 'Provide image file OR lat/lon coordinates.' });
        }

        let aiResponse;

        if (req.file) {
            // ── Send uploaded file to FastAPI ──────────────────────────────
            const form = new FormData();
            form.append('file', fs.createReadStream(req.file.path), {
                filename: req.file.filename,
                contentType: req.file.mimetype,
            });

            const aiRes = await axios.post(`${AI_SERVICE_URL}/analyze`, form, {
                headers: form.getHeaders(),
                timeout: 60000,
            });
            aiResponse = aiRes.data;

        } else {
            // ── Send coordinates to FastAPI (synthetic/simulated field) ──
            const aiRes = await axios.post(`${AI_SERVICE_URL}/analyze-coords`, {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
            }, { timeout: 60000 });
            aiResponse = aiRes.data;
        }

        // ── Build 7-day forecast ──────────────────────────────────────────
        const forecast = buildForecast(aiResponse.stress_percentage);

        // ── Build farmer advisory + SMS ───────────────────────────────────
        const { advisory, sms } = buildAdvisory(
            aiResponse.stress_percentage,
            aiResponse.alert_level,
            aiResponse.indices,
        );

        // ── Persist to MongoDB ────────────────────────────────────────────
        const record = await FieldAnalysis.create({
            fieldName,
            sourceType: req.file ? 'upload' : 'coordinates',
            filename: req.file?.filename,
            coordinates: lat ? { lat: parseFloat(lat), lon: parseFloat(lon) } : undefined,
            stressPercentage: aiResponse.stress_percentage,
            alertLevel: aiResponse.alert_level,
            indices: aiResponse.indices,
            overlayImageB64: aiResponse.overlay_image,
            rgbImageB64: aiResponse.rgb_image,
            ndviImageB64: aiResponse.ndvi_image,
            farmerAdvisory: advisory,
            smsTemplate: sms,
            forecast,
            processingTimeMs: Date.now() - t0,
        });

        // Clean up temp file
        if (req.file) {
            fs.unlink(req.file.path, () => { });
        }

        return res.status(200).json({
            success: true,
            analysisId: record._id,
            fieldId: record.fieldId,
            stressPercentage: record.stressPercentage,
            alertLevel: record.alertLevel,
            indices: record.indices,
            overlayImage: record.overlayImageB64,
            rgbImage: record.rgbImageB64,
            ndviImage: record.ndviImageB64,
            farmerAdvisory: record.farmerAdvisory,
            smsTemplate: record.smsTemplate,
            forecast: record.forecast,
            processingTimeMs: record.processingTimeMs,
        });

    } catch (err) {
        console.error('[ANALYZE ERROR]', err.message);

        // Cleanup on error
        if (req.file) fs.unlink(req.file.path, () => { });

        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'AI microservice is offline. Start the FastAPI service first.' });
        }

        next(err);
    }
});

module.exports = router;
