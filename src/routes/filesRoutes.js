const express = require("express");
const router = express.Router();
const filesController = require("../controllers/filesController");
const multerMiddleware = require("../middlewares/multerMiddleware");
const authMiddleware = require("../middlewares/auth-middleware");
const rateLimit = require("express-rate-limit");

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // Максимальное количество запросов
  message: "Слишком много запросов на загрузку файлов. Попробуйте позже.",
  skipSuccessfulRequests: false,
  skip: (req, res) => {
    // Пропускаем лимитер для пользователей с ролью admin
    return req.user && req.user.role === 'admin';
  }
});

router.post(
  "/upload",
  authMiddleware(["all"]), // Сначала аутентификация
  uploadLimiter,            // Потом лимитер (будет знать о роли)
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 30,
    imagesOnly: false,
    useTemp: true,
  }),
  filesController.uploadFiles
);

router.post(
  "/delete",
  authMiddleware(["all"]),
  filesController.deleteFiles
);

module.exports = router;