import { Router } from "express";

const router = Router();

import rateLimit from "express-rate-limit";
import filesController from "../controllers/filesController";
import authMiddleware from "../middlewares/auth-middleware";
import imageCompressor from "../middlewares/imageCompressor";
import multerMiddleware from "../middlewares/multerMiddleware";

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
	uploadLimiter,
	multerMiddleware({
		fields: "files",
		maxFileSizeMB: 30,
		imagesOnly: false,
		useTemp: true,
	}),
	imageCompressor.middleware(compressionOptions), // Добавляем сжатие
	filesController.uploadFiles,
);

// Остальные роуты без изменений
router.post("/delete", authMiddleware(["all"]), filesController.deleteFiles);

export default router;
