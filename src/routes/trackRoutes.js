const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../middlewares/requireAuth");
const Track = mongoose.model("Track");
const User = mongoose.model("User");
const Alert = mongoose.model("Alert");
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
    if (!req.user.phone) {
        return res.status(422).send({ error: "No phone number saved for this user" });
    }
    const link = `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`;
    try {
        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
            method: "POST",
            headers: {
                authorization: process.env.FAST2SMS_API_KEY,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                message: `ALERT: Patient is outside the safe area${typeof dist === "number" ? `, ${dist.toFixed(2)} km from start` : ""}. Live location: ${link}`,
                language: "english",
                route: "q",
                numbers: String(req.user.phone),
            }),
        });
        const result = await response.json();
        console.log("Fast2SMS", response.status, JSON.stringify(result));
        const smsSent = response.ok && !!result.return;
        const alert = await saveAlert(req.user._id, coords, dist, smsSent);
        if (!smsSent) {
            return res.status(502).send({ error: "SMS failed", provider: result, alert });
        }
        res.send({ ...result, alert });
    } catch (err) {
        console.log("Fast2SMS request error", err.message);
        const alert = await saveAlert(req.user._id, coords, dist, false);
        res.status(502).send({ error: "SMS failed", message: err.message, alert });
    }
});

const saveAlert = (userId, coords, dist, smsSent) =>
    new Alert({
        userId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distanceKm: typeof dist === "number" ? dist : undefined,
        smsSent,
    }).save();

router.get("/alerts", async (req, res) => {
    const alerts = await Alert.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.send(alerts);
});

module.exports = router;
