const multer = require("multer");
const path = require("path");
const fs = require("fs");

const createUploadMiddleware = (folderName = "uploads") => {
  const uploadDir = path.join(__dirname, "..", "uploads", folderName);

  // Создаем папку, если не существует
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Настройки хранилища
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const filename = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
      cb(null, filename);
    },
  });

  // Фильтр — разрешаем фото и видео
  const fileFilter = (req, file, cb) => {
    const allowedTypes = ["image/", "video/"];
    const isAllowed = allowedTypes.some((type) =>
      file.mimetype.startsWith(type)
    );

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только изображения и видео."), false);
    }
  };

  return multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
  },
});
};

module.exports = createUploadMiddleware;