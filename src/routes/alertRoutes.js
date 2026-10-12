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

// last 10 digits, so "+91 76060 70635", "917606070635" and 7606070635 all compare equal
const lastTen = value => String(value || "").replace(/\D/g, "").slice(-10);

// Step 2: the caregiver taps Start, then shares their phone number in Telegram.
// Called twice: first it finds the Start message and asks for the number,
// then it checks the shared number is the caller's own and matches the registered phone.
router.post("/telegram/verify", async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user.telegramLinkCode) {
        return res.status(400).send({ error: "Start connecting Telegram first" });
    }
    try {
        // no webhook is used, so recent messages to the bot can be read with getUpdates
        const messages = (await telegram("getUpdates", { allowed_updates: ["message"] }))
            .map(u => u.message)
            .filter(Boolean);

        if (!user.telegramPendingChatId) {
            const start = messages.find(m => m.text === `/start ${user.telegramLinkCode}`);
            if (!start) {
                return res.status(404).send({ error: "We didn't see you press Start in Telegram yet. Try again." });
            }
            user.telegramPendingChatId = String(start.chat.id);
            await user.save();
            await telegram("sendMessage", {
                chat_id: start.chat.id,
                text: `To confirm this is your Telegram, share your phone number. It must match the number registered in SafeWalk (ending ${lastTen(user.phone).slice(-4)}).`,
                reply_markup: {
                    keyboard: [[{ text: "Share my phone number", request_contact: true }]],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            });
            return res.status(202).send({ step: "share_phone" });
        }

        const shared = messages
            .filter(m => String(m.chat.id) === user.telegramPendingChatId && m.contact)
            .pop();
        if (!shared) {
            return res.status(404).send({ error: "We didn't receive your phone number yet. Tap “Share my phone number” in Telegram." });
        }
        // a forwarded contact card has someone else's user_id; only accept the sender's own number
        if (shared.contact.user_id !== shared.from.id) {
            return res.status(422).send({ error: "Please share your own number using the button, not a contact." });
        }
        if (lastTen(shared.contact.phone_number) !== lastTen(user.phone)) {
            await telegram("sendMessage", {
                chat_id: shared.chat.id,
                text: "This Telegram number doesn't match the phone registered in SafeWalk, so alerts were not connected.",
                reply_markup: { remove_keyboard: true },
            });
            user.telegramPendingChatId = undefined;
            user.telegramLinkCode = undefined;
            await user.save();
            return res.status(422).send({
                error: `This Telegram account's number doesn't match the registered phone ${user.phone}. Use the Telegram account for that number, or update your phone in Profile.`,
            });
        }
        const from = shared.from || {};
        user.telegramChatId = user.telegramPendingChatId;
        user.telegramName = from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(" ");
        user.telegramPhone = lastTen(shared.contact.phone_number);
        user.telegramPendingChatId = undefined;
        user.telegramLinkCode = undefined;
        user.alertChannel = "telegram";
        await user.save();
        await telegram("sendMessage", {
            chat_id: user.telegramChatId,
            text: "SafeWalk is connected. Safe-zone alerts will arrive in this chat.",
            reply_markup: { remove_keyboard: true },
        });
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
