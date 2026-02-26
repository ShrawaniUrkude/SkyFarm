// ─── SkyFarm Backend — Express + MongoDB + Multer ───────────────────────────
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const path = require("path");

const analysisRoutes = require("./routes/analysis");
const historyRoutes = require("./routes/history");
const aiInsightRoutes = require("./routes/ai-insight");

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow no-origin requests (curl/Postman) and any localhost port
      if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin))
        return cb(null, true);
      // Production: restrict to FRONTEND_URL
      if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
        return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/analyze", analysisRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/ai-insight", aiInsightRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "skyfarm-backend",
    ts: new Date().toISOString(),
  });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal server error" });
});

// ─── MongoDB Connect + Start ──────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/skyfarm";

// Always start the HTTP server so /api/ai-insight works even without MongoDB.
app.listen(PORT, () =>
  console.log(`🚀 SkyFarm backend running on http://localhost:${PORT}`),
);

mongoose
  .connect(MONGO_URI)
  .then(() => console.log(`✅ MongoDB connected: ${MONGO_URI}`))
  .catch((err) => {
    console.error("⚠️  MongoDB connection failed (non-fatal):", err.message);
    console.error(
      "   Analyse & History routes will not work, but AI Insight will.",
    );
  });
