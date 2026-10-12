const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../middlewares/requireAuth");
const User = mongoose.model("User");
const router = express.Router();
router.use(requireAuth);

router.get("/operationUser", async (req, res) => {
    res.send(req.user);
});

const MIN_RADIUS_KM = 0.1;
const MAX_RADIUS_KM = 10;

const validProfile = ({ dist, homeLocation }) => {
    if (dist !== undefined && !(typeof dist === "number" && dist >= MIN_RADIUS_KM && dist <= MAX_RADIUS_KM)) {
        return `Safe distance must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km`;
    }
    if (homeLocation !== undefined) {
        const { latitude, longitude } = homeLocation || {};
        if (!(typeof latitude === "number" && Math.abs(latitude) <= 90 &&
              typeof longitude === "number" && Math.abs(longitude) <= 180)) {
            return "Home location must have a valid latitude and longitude";
        }
    }
    return null;
};

router.put("/operationUser", async (req, res) => {
    const { phone, name, city, dist, homeLocation } = req.body.userData || {};
    const error = validProfile({ dist, homeLocation });
    if (error) {
        return res.status(422).send({ error });
    }
    try {
        const update = { phone, name, city, dist, homeLocation };
        // Telegram was confirmed for the old number; a new number means it must be reconnected
        const digits = v => String(v || "").replace(/\D/g, "").slice(-10);
        if (phone !== undefined && req.user.telegramPhone && digits(phone) !== req.user.telegramPhone) {
            update.$unset = { telegramChatId: 1, telegramName: 1, telegramPhone: 1 };
            update.alertChannel = "sms";
        }
        const user = await User.findByIdAndUpdate(req.user._id, update, {
            new: true,
            runValidators: true,
            omitUndefined: true,
        });
        res.send(user);
    } catch (err) {
        res.status(422).send({ error: err.message });
    }
});

module.exports = router;
