import { Router } from "express";

const router = Router();

import rateLimit from "express-rate-limit";
import filesController from "../controllers/filesController.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import imageCompressor from "../middlewares/imageCompressor.js";
import multerMiddleware from "../middlewares/multerMiddleware.js";
import quotaChecker from "../middlewares/quotaChecker.js";

const uploadLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 20,
	message: "Слишком много запросов",
	skip: (req) => req.user && req.user.role === "admin",
});

const compressionOptions = {
	maxWidth: 1920,
	maxHeight: 1080,
	quality: 80,
	webpQuality: 80,
	convertToWebp: true,
};

// Защищённые маршруты (требуют авторизации)
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
	quotaChecker({ maxTotalSizeMB: 100 }),
	imageCompressor.middleware(compressionOptions),
	filesController.uploadFiles,
);

router.post("/delete", authMiddleware(["all"]), filesController.deleteFiles);

router.post("/confirm", authMiddleware(["all"]), filesController.confirmFiles);

router.get("/files/:id", authMiddleware(["all"]), filesController.downloadFile);

router.get(
	"/user-files",
	authMiddleware(["all"]),
	filesController.getUserFiles,
);

router.get(
	"/entity/:entityType/:entityId",
	authMiddleware(["all"]),
	filesController.getEntityFiles,
);

// Публичный маршрут (без авторизации)
router.get("/public/files/:token", filesController.publicDownloadFile);

export default router;
