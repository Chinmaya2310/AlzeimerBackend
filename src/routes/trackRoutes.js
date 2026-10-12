const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../middlewares/requireAuth");
const Track = mongoose.model("Track");
const User = mongoose.model("User");
const Alert = mongoose.model("Alert");
const { notify } = require("../services/notify");
const router = express.Router();

router.use(requireAuth);

router.get("/getdetails", async (req, res) => {
    console.log("Hiii user info", req.user);
    res.send(req.user);
});

router.get("/tracks", async (req, res) => {
    console.log("Req is ", req.user);
    const tracks = await Track.find({ userId: req.user._id });
    res.send(tracks);
});

router.post("/tracks", async (req, res) => {
    const { name, locations } = req.body;
    if (!name || !locations) {
        return res
            .status(422)
            .send({ error: "You must provide a name and location" });
    }
    try {
        const track = new Track({ name, locations, userId: req.user._id });
        await track.save();
        res.send(track);
    } catch (err) {
        res.status(422).send({ error: err.message });
    }
});

router.post("/sendMessage", async (req, res) => {
    const { currentLocation, dist } = req.body;
    const coords = currentLocation?.coords || currentLocation?.currentLocation?.coords;
    if (!coords) {
        return res.status(422).send({ error: "You must provide the current location" });
    }
    const link = `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`;
    const away = typeof dist === "number" ? `, ${dist.toFixed(2)} km from home` : "";
    const text = `ALERT: Patient is outside the safe area${away}. Live location: ${link}`;
    const channel = req.user.alertChannel || "sms";
    try {
        await notify(req.user, text, coords);
        const alert = await saveAlert(req.user._id, coords, dist, channel, true);
        res.send({ alert });
    } catch (err) {
        console.log("Alert failed:", err.message);
        const alert = await saveAlert(req.user._id, coords, dist, channel, false);
        res.status(502).send({ error: "Alert failed", message: err.message, alert });
    }
});

const saveAlert = (userId, coords, dist, channel, sent) =>
    new Alert({
        userId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distanceKm: typeof dist === "number" ? dist : undefined,
        channel,
        sent,
    }).save();

router.get("/alerts", async (req, res) => {
    const alerts = await Alert.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.send(alerts);
});

module.exports = router;
