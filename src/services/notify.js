// Sends alerts to the caregiver over SMS (Fast2SMS, paid) or Telegram (free)

const TELEGRAM_API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// a real BotFather token looks like 123456789:AA... (ignore the placeholder in .env)
const telegramEnabled = () => /^\d+:[\w-]{20,}$/.test(process.env.TELEGRAM_BOT_TOKEN || "");

const telegram = async (method, params) => {
    // never wait forever: a hung request would stall the bot's polling loop
    const waitSeconds = (params.timeout || 0) + 15;
    const response = await fetch(`${TELEGRAM_API()}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(waitSeconds * 1000),
    });
    const result = await response.json();
    if (!result.ok) {
        throw new Error(`Telegram ${method} failed: ${result.description}`);
    }
    return result.result;
};

const sendSms = async (phone, text) => {
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ message: text, language: "english", route: "q", numbers: String(phone) }),
    });
    const result = await response.json();
    console.log("Fast2SMS", response.status, JSON.stringify(result));
    if (!response.ok || !result.return) {
        throw new Error(`SMS failed: ${JSON.stringify(result)}`);
    }
    return result;
};

const sendTelegram = async (chatId, text, coords) => {
    await telegram("sendMessage", { chat_id: chatId, text });
    if (coords) {
        await telegram("sendLocation", { chat_id: chatId, latitude: coords.latitude, longitude: coords.longitude });
    }
    console.log("Telegram alert sent to chat", chatId);
};

// Sends to the channel the user chose; returns the channel used
const notify = async (user, text, coords) => {
    if (user.alertChannel === "telegram") {
        if (!user.telegramChatId) {
            throw new Error("Telegram is not connected for this account");
        }
        if (!user.telegramPhone) {
            throw new Error("Reconnect Telegram to confirm it belongs to the registered phone number");
        }
        await sendTelegram(user.telegramChatId, text, coords);
        return "telegram";
    }
    if (!user.phone) {
        throw new Error("No phone number saved for this user");
    }
    await sendSms(user.phone, text);
    return "sms";
};

module.exports = { notify, telegram, telegramEnabled, sendTelegram };
