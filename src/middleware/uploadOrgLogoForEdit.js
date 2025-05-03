const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Генератор хранилища для редактирования логотипов организации
const generateStorage = (baseDir = "uploads/org_logos") => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      // Логика такая же, как при создании
      if (!req.uniqueFolder) {
        req.uniqueFolder = uuidv4();
      }

      const dirPath = path.join(__dirname, "..", baseDir, req.uniqueFolder);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      req.uploadPath = path.join(baseDir, req.uniqueFolder);
      cb(null, dirPath);
    },
    filename: (req, file, cb) => {
      const filename = `${Date.now()}${path.extname(file.originalname)}`;
      req.savedFilename = filename;
      cb(null, filename);
    }
  });
};

const uploadOrgLogoForEdit = multer({ storage: generateStorage() });

module.exports = {
  uploadOrgLogoForEdit
};