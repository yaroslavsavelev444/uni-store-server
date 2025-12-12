const fs = require("fs");
const path = require("path");
const fsp = require("fs/promises");

/**
 * Перемещает файл из временной директории в финальную с проверками.
 * @param {string} tempPath - Абсолютный путь к исходному файлу.
 * @param {string} finalPath - Абсолютный путь к целевому файлу.
 */
async function moveFileToFinal(tempPath, finalPath) {
  try {
    // Проверка, существует ли исходный файл
    const tempExists = fs.existsSync(tempPath);
    if (!tempExists) {
      console.error(`Исходный файл не найден: ${tempPath}`);
      return;
    }

    // Создание целевой директории при необходимости
    const finalDir = path.dirname(finalPath);
    await fsp.mkdir(finalDir, { recursive: true });

    // Если файл уже существует — удалить перед перемещением
    if (fs.existsSync(finalPath)) {
      await fsp.unlink(finalPath);
    }

    // Перемещение
    await fsp.rename(tempPath, finalPath);

    console.log(`Файл успешно перемещён из ${tempPath} → ${finalPath}`);
  } catch (error) {
    console.error(`Ошибка при перемещении файла: ${error.message}`);
  }
}

module.exports = moveFileToFinal;