const { Router } = require("express");
const {
  deleteFile,
  serveFile,
  uploadFiles,
} = require("../controllers/filesController.js");
const authMiddleware = require("../middlewares/auth-middleware.js");
const multerMiddleware = require("../middlewares/multerMiddleware.js");

const router = Router();

import rateLimit from "express-rate-limit";
import filesController from "../controllers/filesController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import imageCompressor from "../middlewares/imageCompressor.js";
import multerMiddleware from "../middlewares/multerMiddleware.js";

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Слишком много запросов на загрузку файлов. Попробуйте позже.",
  skipSuccessfulRequests: false,
  skip: (req, _res) => {
    return req.user && req.user.role === "admin";
  },
});

// Настройки сжатия
const compressionOptions = {
  maxWidth: 1920, // Максимальная ширина
  maxHeight: 1080, // Максимальная высота
  quality: 80, // Качество для JPEG
  webpQuality: 80, // Качество для WebP
  convertToWebp: true, // Конвертировать все в WebP (меньший размер)
};

router.post(
  "/upload",
  authMiddleware(["all"]),
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 30,
    useTemp: true,
  }),
  uploadFiles,
);

router.get("/:fileId", authMiddleware.optional(["all"]), serveFile);

router.delete("/:fileId", authMiddleware(["all"]), deleteFile);

module.exports = router;
