// middlewares/uploadOrderFile.js
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sanitize = require("sanitize-filename");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.uniqueFolder) {
      req.uniqueFolder = uuidv4();
    }
    const dirPath = path.join(__dirname, "..", "uploads", "orderFiles", req.uniqueFolder);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    req.uploadPath = path.join("orderFiles", req.uniqueFolder);
    cb(null, dirPath);
  },
  filename: (req, file, cb) => {
    const safeName = sanitize(file.originalname);
    const uniqueName = `${uuidv4()}-${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage }).single("file"); // ⬅️ Под один файл

const uploadOrderFile = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) return next(err);

    // Получение displayName как строкиф
    const displayName = req.body.displayName;
    req.displayName = displayName;

    next();
  });
};

module.exports = uploadOrderFile;