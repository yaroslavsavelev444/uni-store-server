// middlewares/uploadOrgFiles.js
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
    const dirPath = path.join(__dirname, "..", "uploads", "orgFiles", req.uniqueFolder);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    req.uploadPath = path.join("orgFiles", req.uniqueFolder);
    cb(null, dirPath);
  },
  filename: (req, file, cb) => {
    const safeName = sanitize(file.originalname);
    const uniqueName = `${uuidv4()}-${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

const uploadOrgFiles = (req, res, next) => {
  // Для получения displayNames из FormData
  upload.array("files")(req, res, (err) => {
    if (err) return next(err);

    // Обработка displayNames
    const rawDisplayNames = req.body.displayNames;

    // normalize to array
    if (!Array.isArray(rawDisplayNames)) {
      req.displayNames = [rawDisplayNames];
    } else {
      req.displayNames = rawDisplayNames;
    }

    next();
  });
};

module.exports = uploadOrgFiles;