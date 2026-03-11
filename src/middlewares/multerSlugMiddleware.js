import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import multer, { diskStorage } from "multer";
import logger from "../logger/logger.js";

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
];

const ensureDirExists = (dirPath) => {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
		logger.info(`[UPLOAD INIT] Папка ${dirPath} создана`);
	}
};

const fileFilterImagesOnly = (req, file, cb) => {
	if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
		cb(null, true);
	} else {
		logger.error(`[UPLOAD WARNING] Неразрешённый MIME: ${file.mimetype}`);
		cb(new Error("Только изображения разрешены"));
	}
};

const storage = diskStorage({
	destination: (req, file, cb) => {
		// Получаем slug из тела запроса
		const slug = req.body.slug;
		if (!slug) {
			return cb(new Error("Отсутствует поле slug в запросе"));
		}

		// Путь для загрузки: ./uploads/articles/{slug}
		const uploadDir = join(__dirname, "..", "uploads", "articles", slug);
		ensureDirExists(uploadDir);
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const ext = extname(file.originalname);
		const baseName = basename(file.originalname, ext);
		const timestamp = Date.now();
		const uniqueSuffix = `${timestamp}-${Math.round(Math.random() * 1e9)}`;
		cb(null, `${baseName}-${uniqueSuffix}${ext}`);
	},
});

const maxFileSizeMB = 5; // 5 MB лимит
const maxContentImages = 20; // Максимум 20 изображений в contentImages

const upload = multer({
	storage,
	fileFilter: fileFilterImagesOnly,
	limits: {
		fileSize: maxFileSizeMB * 1024 * 1024,
	},
});

const multerSlugMiddleware = upload.fields([
	{ name: "cover", maxCount: 1 },
	{ name: "contentImages", maxCount: maxContentImages },
]);

export default multerSlugMiddleware;
