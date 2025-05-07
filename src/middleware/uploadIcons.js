// middleware/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Папка загрузки
const uploadDir = path.join(__dirname, "..", "uploads", "social-icons");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadSocialIcons = multer({ storage }).array("icon", 10); // максимум 10 иконок

module.exports = {
  uploadSocialIcons,
};