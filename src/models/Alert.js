const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    latitude: Number,
    longitude: Number,
    distanceKm: Number,
    channel: { type: String, enum: ["sms", "telegram"] },
    sent: Boolean,
    smsSent: Boolean, // older alerts (before Telegram) only have this
    createdAt: { type: Date, default: Date.now },
});
mongoose.model("Alert", alertSchema);
