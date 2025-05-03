const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Генерация хранилища с уникальной директорией
const generateStorage = (baseDir = "uploads/files") => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      // Создаем уникальную папку для загрузки, если ещё не создана
      if (!req.uniqueFolder) {
        req.uniqueFolder = uuidv4();
      }

      const dirPath = path.join(__dirname, "..", baseDir, req.uniqueFolder);

      // Если директории нет — создаем рекурсивно
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Сохраняем путь для дальнейшего использования в контроллере
      req.uploadPath = path.join(baseDir, req.uniqueFolder);
      cb(null, dirPath);
    },
    filename: (req, file, cb) => {
      // Генерируем имя файла с меткой времени и расширением оригинала
      const filename = `${Date.now()}${path.extname(file.originalname)}`;

      // Сохраняем имя загруженного файла для контроллера
      req.savedFilename = filename;
      cb(null, filename);
    }
  });
};

// Создание миддлвары для редактирования продукта
const uploadProductForEdit = multer({ storage: generateStorage("uploads/files") });

module.exports = {
  uploadProductForEdit
};