const fileService = require('./fileManager');
const fs = require('fs').promises;
const path = require('path');

/**
 * Обработка файлов продукта (изображений и инструкции)
 * Перемещает файлы из temp в постоянные папки
 */
exports.processProductFiles = async (productData) => {
  const result = { ...productData };
  
  // Обрабатываем основное изображение (если есть)
  if (result.mainImage && result.mainImage.url) {
    const processedMainImage = await processSingleFile(
      result.mainImage.url, 
      'products/images',
      'mainImage'
    );
    result.mainImage.url = processedMainImage;
  }
  
  // Обрабатываем массив изображений
  if (result.images && Array.isArray(result.images)) {
    const processedImages = [];
    
    for (const image of result.images) {
      if (image._shouldDelete) {
        // Помечаем на удаление существующий файл
        continue;
      }
      
      if (image.url) {
        const processedImage = await processSingleFile(
          image.url, 
          'products/images',
          'gallery'
        );
        
        processedImages.push({
          ...image,
          url: processedImage
        });
      }
    }
    
    result.images = processedImages;
  }
  
  if (result.instruction === null) {
  delete result.instruction;
}

  // Обрабатываем файл инструкции
  if (result.instructionFile) {
    if (result.instructionFile._shouldDelete) {
      // Помечаем на удаление
      result.instructionFile = null;
    } else if (result.instructionFile.url) {
      const processedInstruction = await processSingleFile(
        result.instructionFile.url, 
        'products/instructions',
        'instruction'
      );
      
      result.instructionFile.url = processedInstruction;
    }
  }
  
  return result;
};
const API_URL = process.env.API_URL || 'https://api.npo-polet.ru';
/**
 * Обработка одного файла
 */
const processSingleFile = async (fileUrl, targetFolder, fileType) => {
  let cleanPath = fileUrl;
  let isExisting = false;

  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    const url = new URL(fileUrl);
    cleanPath = url.pathname;
    cleanPath = decodeURIComponent(cleanPath);

    // Если это домен нашего API и не temp (неизменённое существующее изображение), сохраняйте полный URL, без проверки
    if (fileUrl.startsWith(API_URL) && !cleanPath.includes('/temp/')) {
      isExisting = true;
      // Опционально: Проверьте существование для отчёта, но не выбрасывайте исключение
      try {
        await fileService.validateFileExists(cleanPath);
      } catch (error) {
        console.warn(`Предупреждение: Отсутствует или недоступен файл существующего изображения: ${fileUrl} - ${error.message}`);
      }
      return fileUrl; // Сохраняйте оригинальный полный URL
    }
  }

  // Если не в temp, возвращайте cleanPath (для других случаев без temp)
  if (!cleanPath.includes('/temp/')) {
    return cleanPath;
  }

  // Для новых/temp файлов: Проверяйте (выбрасывайте при ошибке)
  await fileService.validateFileExists(cleanPath);
  
  // Генерируем уникальное имя файла
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const originalName = path.basename(cleanPath);
  const extension = path.extname(originalName);
  const safeName = path.basename(originalName, extension)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 100);
  
  const newFileName = `${timestamp}_${random}_${safeName}${extension}`;
  const newWebPath = `/uploads/${targetFolder}/${newFileName}`;
  
  // Перемещаем файл из temp в постоянную папку
  const sourceAbsolute = fileService.getAbsolutePath(cleanPath);
  const targetAbsolute = fileService.getAbsolutePath(newWebPath);
  
  // Создаем папку назначения если нет
  const targetDir = path.dirname(targetAbsolute);
  await fs.mkdir(targetDir, { recursive: true });
  
  try {
    await fs.rename(sourceAbsolute, targetAbsolute);
  } catch (error) {
    // Альтернатива: копировать и удалить оригинал
    await fs.copyFile(sourceAbsolute, targetAbsolute);
    await fs.unlink(sourceAbsolute);
  }
  
  return newWebPath;
};

/**
 * Удаление старых файлов при обновлении продукта
 */
exports.cleanupOldProductFiles = async (existingProduct, newData) => {
  // Удаляем старое основное изображение если оно было заменено
  if (existingProduct.mainImage && existingProduct.mainImage.url) {
    const shouldDeleteMainImage = 
      // Новое изображение загружено
      (newData.mainImage && newData.mainImage.url && 
       newData.mainImage.url !== existingProduct.mainImage.url) ||
      // Изображение помечено на удаление
      (newData.mainImage === null);
    
    if (shouldDeleteMainImage) {
      try {
        await fileService.deleteFile(existingProduct.mainImage.url);
      } catch (error) {
        console.warn(`Не удалось удалить старое основное изображение: ${error.message}`);
      }
    }
  }
  
  // Удаляем старые изображения галереи
  if (existingProduct.images && Array.isArray(existingProduct.images)) {
    const existingImageUrls = existingProduct.images.map(img => img.url);
    const newImageUrls = newData.images 
      ? newData.images.filter(img => !img._shouldDelete).map(img => img.url)
      : [];
    
    const imagesToDelete = existingImageUrls.filter(url => 
      !newImageUrls.includes(url)
    );
    
    for (const imageUrl of imagesToDelete) {
      try {
        await fileService.deleteFile(imageUrl);
      } catch (error) {
        console.warn(`Не удалось удалить изображение галереи: ${error.message}`);
      }
    }
  }
  
  // Удаляем старую инструкцию
  if (existingProduct.instructionFile && existingProduct.instructionFile.url) {
    const shouldDeleteInstruction = 
      // Новая инструкция загружена
      (newData.instructionFile && newData.instructionFile.url && 
       newData.instructionFile.url !== existingProduct.instructionFile.url) ||
      // Инструкция помечена на удаление
      (newData.instructionFile === null);
    
    if (shouldDeleteInstruction) {
      try {
        await fileService.deleteFile(existingProduct.instructionFile.url);
      } catch (error) {
        console.warn(`Не удалось удалить старую инструкцию: ${error.message}`);
      }
    }
  }
};