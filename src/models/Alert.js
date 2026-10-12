const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    latitude: Number,
    longitude: Number,
    distanceKm: Number,
    smsSent: Boolean,
    createdAt: { type: Date, default: Date.now },
});
mongoose.model("Alert", alertSchema);
