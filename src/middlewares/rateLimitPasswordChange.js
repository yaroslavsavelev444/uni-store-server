// middlewares/rateLimitPasswordChange.js

const { UserModel } = require("../models/index.models");

const rateLimitPasswordChange = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const ip = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

   const user = await UserModel.findById(userId).select("+passwordChangeHistory");
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Оставляем записи не старше часа
    user.passwordChangeHistory = user.passwordChangeHistory.filter(
      (entry) => entry.timestamp > oneHourAgo
    );

    // Подсчитываем количество смен пароля за последний час (со всех IP)
    const recentChangeCount = user.passwordChangeHistory.length;

    if (recentChangeCount >= 3) {
      return res.status(429).json({
        message: "Превышен лимит смены пароля (3 раза в час). Попробуйте позже.",
      });
    }

    // Добавляем новую запись с текущим временем и IP
    user.passwordChangeHistory.push({ timestamp: now, ip });

    // Также чистим историю старше 24 часов, чтобы не разрасталась
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    user.passwordChangeHistory = user.passwordChangeHistory.filter(
      (entry) => entry.timestamp > dayAgo
    );

    await user.save();

    next();
  } catch (error) {
    console.error("Rate limit password change error:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
};

module.exports = rateLimitPasswordChange;