import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Перемещает файл из временной директории в финальную с проверками.
 * @param {string} tempPath - Абсолютный путь к исходному файлу.
 * @param {string} finalPath - Абсолютный путь к целевому файлу.
 */
async function moveFileToFinal(tempPath, finalPath) {
  try {
    // Проверка, существует ли исходный файл
    const tempExists = existsSync(tempPath);
    if (!tempExists) {
      console.error(`Исходный файл не найден в  moveFileToFinal: ${tempPath}`);
      return;
    }

    // Создание целевой директории при необходимости
    const finalDir = dirname(finalPath);
    await mkdir(finalDir, { recursive: true });

    // Если файл уже существует — удалить перед перемещением
    if (existsSync(finalPath)) {
      await unlink(finalPath);
    }

    // Перемещение
    await rename(tempPath, finalPath);

    console.log(`Файл успешно перемещён из ${tempPath} → ${finalPath}`);
  } catch (error) {
    console.error(`Ошибка при перемещении файла: ${error.message}`);
  }
}

export default moveFileToFinal;
