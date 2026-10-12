// Decides when a location update should alert the caregiver.
// Lives on the server so alerts don't depend on the app's screen being open.
const mongoose = require("mongoose");
const { notify } = require("./notify");
const Alert = mongoose.model("Alert");

const OUTSIDE_READINGS = 2; // GPS can jump 20-50 m; need two readings in a row outside
const REARM_FRACTION = 0.9; // re-arm only once clearly back inside

const distanceKm = (a, b) => {
    const rad = d => (d * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const sendAlert = async (user, coords, dist) => {
    const link = `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`;
    const text = `ALERT: Patient is outside the safe area, ${dist.toFixed(2)} km from home. Live location: ${link}`;
    const channel = user.alertChannel || "sms";
    let sent = true;
    try {
        await notify(user, text, coords);
    } catch (err) {
        console.log("Alert failed:", err.message);
        sent = false;
    }
    return new Alert({
        userId: user._id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distanceKm: dist,
        channel,
        sent,
    }).save();
};

// Returns {distanceKm, outside, alert} where alert is set only when one was just sent
const checkLocation = async (user, coords) => {
    if (!user.homeLocation || !user.homeLocation.latitude || !user.dist) {
        return { distanceKm: null, outside: false, alert: null };
    }
    const dist = distanceKm(user.homeLocation, coords);
    const state = user.zoneState || { outsideCount: 0, alerted: false };
    let alert = null;
    if (dist > user.dist) {
        state.outsideCount = (state.outsideCount || 0) + 1;
        if (state.outsideCount >= OUTSIDE_READINGS && !state.alerted) {
            state.alerted = true;
            alert = await sendAlert(user, coords, dist);
        }
    } else {
        state.outsideCount = 0;
        if (dist < user.dist * REARM_FRACTION) {
            state.alerted = false;
        }
    }
    user.zoneState = state;
    user.markModified("zoneState");
    await user.save();
    return { distanceKm: dist, outside: dist > user.dist, alert };
};

module.exports = { checkLocation, distanceKm };
