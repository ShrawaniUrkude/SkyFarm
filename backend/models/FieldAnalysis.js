// ─── Mongoose Schema: FieldAnalysis ─────────────────────────────────────────
const mongoose = require('mongoose');

const ForecastDaySchema = new mongoose.Schema({
    day: { type: Number, required: true },          // 1–7
    date: { type: String, required: true },
    stressIndex: { type: Number, required: true, min: 0, max: 100 },
    alertLevel: { type: String, enum: ['SAFE', 'MONITOR', 'CRITICAL'], required: true },
    recommendation: { type: String },
});

const SpectralIndexSchema = new mongoose.Schema({
    ndvi: { type: Number },
    ndre: { type: Number },
    msi: { type: Number },
    cwsi: { type: Number },
    zScore: { type: Number },
});

const FieldAnalysisSchema = new mongoose.Schema({
    // Identification
    fieldId: { type: String, default: () => `F${Date.now()}` },
    fieldName: { type: String, default: 'Unnamed Field' },

    // Source metadata
    sourceType: { type: String, enum: ['upload', 'coordinates'], required: true },
    filename: { type: String },                          // .tif filename if uploaded
    coordinates: {
        lat: { type: Number },
        lon: { type: Number },
        bbox: { type: [Number] },                             // [minLon, minLat, maxLon, maxLat]
    },

    // AI Results
    stressPercentage: { type: Number, required: true, min: 0, max: 100 },
    alertLevel: { type: String, enum: ['SAFE', 'MONITOR', 'CRITICAL'], required: true },
    indices: { type: SpectralIndexSchema, default: {} },

    // Images (base64 or file path)
    overlayImageB64: { type: String },                       // Stress-Vision overlay
    rgbImageB64: { type: String },
    ndviImageB64: { type: String },

    // Advisory
    farmerAdvisory: { type: String },
    smsTemplate: { type: String },

    // 7-day forecast
    forecast: { type: [ForecastDaySchema], default: [] },

    // Processing meta
    processingTimeMs: { type: Number },
    modelVersion: { type: String, default: '1.0.0' },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, {
    timestamps: true,
    versionKey: false,
});

// Index for fast historical queries
FieldAnalysisSchema.index({ createdAt: -1 });
FieldAnalysisSchema.index({ alertLevel: 1 });
FieldAnalysisSchema.index({ fieldId: 1 });

module.exports = mongoose.model('FieldAnalysis', FieldAnalysisSchema);
