// ─── Route: GET /api/history ─────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const FieldAnalysis = require('../models/FieldAnalysis');

// GET /api/history — paginated list, newest first
router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = parseInt(req.query.skip) || 0;

        const [records, total] = await Promise.all([
            FieldAnalysis.find({}, {
                overlayImageB64: 0, // exclude heavy base64 from list
                rgbImageB64: 0,
                ndviImageB64: 0,
            }).sort({ createdAt: -1 }).skip(skip).limit(limit),
            FieldAnalysis.countDocuments(),
        ]);

        res.json({ total, skip, limit, records });
    } catch (err) {
        next(err);
    }
});

// GET /api/history/:id — full record including images
router.get('/:id', async (req, res, next) => {
    try {
        const record = await FieldAnalysis.findById(req.params.id);
        if (!record) return res.status(404).json({ error: 'Analysis not found' });
        res.json(record);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/history/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await FieldAnalysis.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
