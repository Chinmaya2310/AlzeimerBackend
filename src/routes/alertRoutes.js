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
        await User.findByIdAndUpdate(req.user._id, { telegramLinkCode: code });
        const username = await getBotUsername();
        res.send({ url: `https://t.me/${username}?start=${code}`, botUsername: username });
    } catch (err) {
        res.status(502).send({ error: err.message });
    }
});

// Step 2: after the caregiver taps Start in Telegram, find their chat by the code
router.post("/telegram/verify", async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user.telegramLinkCode) {
        return res.status(400).send({ error: "Start connecting Telegram first" });
    }
    try {
        // no webhook is used, so recent messages to the bot can be read with getUpdates
        const updates = await telegram("getUpdates", { allowed_updates: ["message"] });
        const match = updates
            .map(u => u.message)
            .find(m => m && m.text === `/start ${user.telegramLinkCode}`);
        if (!match) {
            return res.status(404).send({ error: "We didn't see you press Start in Telegram yet. Try again." });
        }
        const from = match.from || {};
        user.telegramChatId = String(match.chat.id);
        user.telegramName = from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(" ");
        user.telegramLinkCode = undefined;
        user.alertChannel = "telegram";
        await user.save();
        await sendTelegram(user.telegramChatId, "SafeWalk is connected. Safe-zone alerts will arrive in this chat.");
        res.send(user);
    } catch (err) {
        res.status(502).send({ error: err.message });
    }
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
        { $unset: { telegramChatId: 1, telegramName: 1, telegramLinkCode: 1 }, alertChannel: "sms" },
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
