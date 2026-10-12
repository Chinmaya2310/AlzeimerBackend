const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const requireAuth = require("../middlewares/requireAuth");
const { notify, telegram, telegramEnabled, sendTelegram } = require("../services/notify");
const User = mongoose.model("User");
const router = express.Router();
router.use(requireAuth);

let botUsername = null;
const getBotUsername = async () => {
    if (!botUsername) {
        botUsername = (await telegram("getMe", {})).username;
    }
    return botUsername;
};

// Step 1: a one-time link that opens the bot with a code, e.g. t.me/SafeWalkBot?start=ab12cd34
router.post("/telegram/link", async (req, res) => {
    if (!telegramEnabled()) {
        return res.status(503).send({ error: "Telegram alerts are not set up on the server" });
    }
    try {
        const code = crypto.randomBytes(8).toString("hex");
        await User.findByIdAndUpdate(req.user._id, { telegramLinkCode: code, $unset: { telegramPendingChatId: 1 } });
        const username = await getBotUsername();
        res.send({ url: `https://t.me/${username}?start=${code}`, botUsername: username });
    } catch (err) {
        res.status(502).send({ error: err.message });
    }
});

// Step 2: the bot (services/telegramBot.js) handles Start and the shared phone number.
// The app calls this to see how far the caregiver has got.
router.post("/telegram/verify", async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user.telegramChatId && user.telegramPhone && !user.telegramLinkCode) {
        return res.send({ step: "connected", user });
    }
    if (user.telegramPendingChatId) {
        return res.send({ step: "share_phone", user });
    }
    if (user.telegramLinkCode) {
        return res.send({ step: "start", user });
    }
    // link code cleared without connecting: the shared number didn't match
    res.status(422).send({
        error: `That Telegram account's number doesn't match the registered phone ${user.phone}. Use the Telegram account for that number, or change the phone in Profile.`,
        user,
    });
});

// Choose how alerts are sent
router.put("/alert-channel", async (req, res) => {
    const { channel } = req.body;
    if (!["sms", "telegram"].includes(channel)) {
        return res.status(422).send({ error: "Channel must be sms or telegram" });
    }
    const user = await User.findById(req.user._id);
    if (channel === "telegram" && !user.telegramChatId) {
        return res.status(422).send({ error: "Connect Telegram first" });
    }
    if (channel === "sms" && !user.phone) {
        return res.status(422).send({ error: "Add a phone number first" });
    }
    user.alertChannel = channel;
    await user.save();
    res.send(user);
});

// Disconnect Telegram (alerts go back to SMS)
router.delete("/telegram", async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $unset: { telegramChatId: 1, telegramName: 1, telegramLinkCode: 1, telegramPendingChatId: 1, telegramPhone: 1 }, alertChannel: "sms" },
        { new: true }
    );
    res.send(user);
});

// Send a test message on the chosen channel (an SMS test costs money)
router.post("/alerts/test", async (req, res) => {
    try {
        const channel = await notify(req.user, "SafeWalk test alert: alerts for this account will arrive here.");
        res.send({ ok: true, channel });
    } catch (err) {
        res.status(502).send({ error: err.message });
    }
});

module.exports = router;
