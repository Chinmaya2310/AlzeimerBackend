// Handles messages sent to the SafeWalk Telegram bot, so the bot replies straight away
// while a caregiver connects their Telegram.
// Locally it long-polls Telegram; when hosted, set TELEGRAM_WEBHOOK_URL and Telegram
// pushes updates to POST /telegram/webhook/<secret> instead (see index.js).
const crypto = require("crypto");
const mongoose = require("mongoose");
const { telegram, telegramEnabled } = require("./notify");
const User = mongoose.model("User");

// last 10 digits, so "+91 76060 70635", "917606070635" and 7606070635 all compare equal
const lastTen = value => String(value || "").replace(/\D/g, "").slice(-10);

const SHARE_KEYBOARD = {
    keyboard: [[{ text: "Share my phone number", request_contact: true }]],
    one_time_keyboard: true,
    resize_keyboard: true,
};

const reply = (chatId, text, reply_markup) =>
    telegram("sendMessage", { chat_id: chatId, text, ...(reply_markup ? { reply_markup } : {}) });

const askForNumber = (chatId, user) =>
    reply(
        chatId,
        `To confirm this is your Telegram, tap “Share my phone number” below. It must be the number registered in SafeWalk (ending ${lastTen(user.phone).slice(-4)}).`,
        SHARE_KEYBOARD
    );

const handleUpdate = async update => {
    const message = update.message;
    if (!message || !message.chat) {
        return;
    }
    const chatId = String(message.chat.id);

    // 1. Start with a one-time code from the app
    const start = (message.text || "").match(/^\/start\s+([0-9a-f]+)$/);
    if (start) {
        const user = await User.findOne({ telegramLinkCode: start[1] });
        if (!user) {
            return reply(chatId, "This link has expired. In the SafeWalk app, open Profile → Alerts via → Telegram to get a new one.");
        }
        user.telegramPendingChatId = chatId;
        await user.save();
        return askForNumber(chatId, user);
    }

    const user = await User.findOne({ telegramPendingChatId: chatId });
    if (!user) {
        return reply(chatId, "To get SafeWalk alerts here, open the SafeWalk app → Profile → Alerts via → Telegram.");
    }

    // 2. The shared contact must be the sender's own number and match the registered phone
    if (message.contact) {
        if (message.contact.user_id !== message.from.id) {
            return askForNumber(chatId, user);
        }
        if (lastTen(message.contact.phone_number) !== lastTen(user.phone)) {
            user.telegramPendingChatId = undefined;
            user.telegramLinkCode = undefined;
            await user.save();
            return reply(
                chatId,
                "This Telegram number doesn't match the phone registered in SafeWalk, so alerts were not connected. Use the Telegram account for that number, or change the phone in the app's Profile.",
                { remove_keyboard: true }
            );
        }
        const from = message.from || {};
        user.telegramChatId = chatId;
        user.telegramName = from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(" ");
        user.telegramPhone = lastTen(message.contact.phone_number);
        user.telegramPendingChatId = undefined;
        user.telegramLinkCode = undefined;
        user.alertChannel = "telegram";
        await user.save();
        return reply(chatId, "SafeWalk is connected. Safe-zone alerts will arrive in this chat. You can go back to the app.", {
            remove_keyboard: true,
        });
    }

    // anything else (e.g. typing the number) can't prove ownership
    return askForNumber(chatId, user);
};

const safeHandle = update =>
    handleUpdate(update).catch(err => console.log("Telegram bot error:", err.message));

// Local mode: long-poll Telegram for new messages
const startPolling = async () => {
    let offset = 0;
    console.log("Telegram bot listening (long polling)");
    for (;;) {
        try {
            const updates = await telegram("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
            for (const update of updates) {
                offset = update.update_id + 1;
                await safeHandle(update);
            }
        } catch (err) {
            console.log("Telegram polling error:", err.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
};

// Hosted mode: Telegram calls our URL; the secret path stops others posting fake updates
const webhookSecret = () =>
    crypto.createHash("sha256").update(String(process.env.TELEGRAM_BOT_TOKEN)).digest("hex").slice(0, 32);

const startBot = async app => {
    if (!telegramEnabled()) {
        return;
    }
    if (process.env.TELEGRAM_WEBHOOK_URL) {
        const path = `/telegram/webhook/${webhookSecret()}`;
        app.post(path, (req, res) => {
            res.sendStatus(200);
            safeHandle(req.body);
        });
        await telegram("setWebhook", { url: `${process.env.TELEGRAM_WEBHOOK_URL}${path}`, allowed_updates: ["message"] });
        console.log("Telegram bot listening (webhook)");
    } else {
        // if a hosted server has the webhook, leave the bot to it instead of competing
        const info = await telegram("getWebhookInfo", {}).catch(() => ({}));
        if (info.url) {
            console.log("Telegram bot is handled by the hosted server; not polling here");
            return;
        }
        startPolling();
    }
};

module.exports = { startBot };
