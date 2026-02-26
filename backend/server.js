// ─── SkyFarm Backend — Express + MongoDB + Multer ───────────────────────────
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const path = require('path');

const analysisRoutes = require('./routes/analysis');
const historyRoutes = require('./routes/history');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5176' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/analyze', analysisRoutes);
app.use('/api/history', historyRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'skyfarm-backend', ts: new Date().toISOString() });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── MongoDB Connect + Start ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/skyfarm';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log(`✅ MongoDB connected: ${MONGO_URI}`);
        app.listen(PORT, () => console.log(`🚀 SkyFarm backend running on http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });
