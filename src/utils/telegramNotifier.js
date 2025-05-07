const axios = require("axios");
const { formatOrderAsTelegramMessage } = require("../tgTemplates/formatOrderAsTelegramMessage");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sendTelegramAlert = async (data) => {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: formatOrderAsTelegramMessage(data),
      parse_mode: "HTML", // Важно!
    });
  } catch (error) {
    console.error("Ошибка отправки в Telegram:", error.response?.data || error.message);
  }
};

module.exports = { sendTelegramAlert };