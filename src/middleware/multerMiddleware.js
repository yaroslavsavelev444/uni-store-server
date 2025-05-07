const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const generateStorage = (baseDir = "uploads/files") => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
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

const uploadProduct = multer({ storage: generateStorage("uploads/products") });
const uploadCategory = multer({ storage: generateStorage("uploads/categories") });
const uploadOrgLogo = multer({ storage: generateStorage("uploads/org_logos") });
const uploadOrgSocial = multer({ storage: generateStorage("uploads/org_socials") });
module.exports = {
  uploadProduct,
  uploadCategory,
  uploadOrgLogo,
  uploadOrgSocial
};