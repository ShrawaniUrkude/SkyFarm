const mongoose = require("mongoose");

const FarmSchema = new mongoose.Schema(
  {
    farmName: { type: String, required: true, trim: true },
    cropType: { type: String, default: "" },
    sowingDate: { type: String, default: "" },
    irrigationType: { type: String, default: "" },
    soilType: { type: String, default: "" },
    area_ha: { type: Number, default: null },
    geometry: { type: Object, required: true }, // GeoJSON Feature
  },
  { timestamps: true },
);

module.exports = mongoose.model("Farm", FarmSchema);
