const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Lazy-load the Mongoose model only when MongoDB is ready
function getFarmModel() {
  try {
    return require("../models/Farm");
  } catch {
    return null;
  }
}

// ── JSON flat-file fallback (used when MongoDB is not connected) ──────────
const FALLBACK_FILE = path.join(__dirname, "..", "farms_local.json");

function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeLocal(farms) {
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(farms, null, 2), "utf8");
}

function isMongoReady() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

/* POST /api/farms/create ─────────────────────────────────────────────── */
router.post("/create", async (req, res) => {
  try {
    const {
      farmName,
      cropType,
      sowingDate,
      irrigationType,
      soilType,
      area_ha,
      geometry,
    } = req.body;

    if (!farmName || !farmName.trim())
      return res.status(400).json({ error: "farmName is required" });
    if (!geometry)
      return res.status(400).json({ error: "geometry (GeoJSON) is required" });

    const doc = {
      farmName: farmName.trim(),
      cropType: cropType || "",
      sowingDate: sowingDate || "",
      irrigationType: irrigationType || "",
      soilType: soilType || "",
      area_ha: area_ha ?? null,
      geometry,
      createdAt: new Date().toISOString(),
    };

    if (isMongoReady()) {
      // ── MongoDB path ────────────────────────────────────────────────
      const Farm = getFarmModel();
      const farm = await Farm.create(doc);
      return res
        .status(201)
        .json({ message: "Farm saved successfully", id: farm._id, farm });
    }

    // ── Flat-file fallback (no MongoDB needed) ──────────────────────
    const farms = readLocal();
    doc.id = crypto.randomUUID();
    farms.push(doc);
    writeLocal(farms);
    console.log(
      `[farms/create] Saved to local file (MongoDB offline): ${doc.farmName}`,
    );
    return res
      .status(201)
      .json({
        message: "Farm saved successfully (local)",
        id: doc.id,
        farm: doc,
      });
  } catch (err) {
    console.error("[farms/create]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* GET /api/farms ─────────────────────────────────────────────────────── */
router.get("/", async (req, res) => {
  try {
    if (isMongoReady()) {
      const Farm = getFarmModel();
      const farms = await Farm.find().sort({ createdAt: -1 });
      return res.json(farms);
    }
    return res.json(readLocal().reverse());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* GET /api/farms/:id ─────────────────────────────────────────────────── */
router.get("/:id", async (req, res) => {
  try {
    if (isMongoReady()) {
      const Farm = getFarmModel();
      const farm = await Farm.findById(req.params.id);
      if (!farm) return res.status(404).json({ error: "Farm not found" });
      return res.json(farm);
    }
    const farms = readLocal();
    const farm = farms.find((f) => f.id === req.params.id);
    if (!farm) return res.status(404).json({ error: "Farm not found" });
    return res.json(farm);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
