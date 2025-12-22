// config/serverConfig.js
const path = require('path');

class ServerConfig {
  constructor() {
    this.protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    this.host = process.env.HOST || 'localhost';
    this.port = process.env.PORT || 3000;
    this.baseUrl = process.env.BASE_URL || `${this.protocol}://${this.host}:${this.port}`;
    
    // Путь для файлов (может быть другой сервер/CDN)
    this.filesBaseUrl = process.env.FILES_BASE_URL || this.baseUrl;
    
    // Директория для загрузок (относительно корня проекта)
    this.uploadsDir = process.env.UPLOADS_DIR || 'uploads';
    this.tempDir = path.join(this.uploadsDir, 'temp');
  }

  /**
   * Формирует полный URL до файла
   * @param {string} filePath - относительный путь к файлу
   * @returns {string} полный URL
   */
  getFileUrl(filePath) {
    if (!filePath) return null;
    
    // Если уже полный URL - возвращаем как есть
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // Убираем лишние слэши
    const cleanFilePath = filePath.replace(/^\//, '');
    const cleanBaseUrl = this.filesBaseUrl.replace(/\/$/, '');
    
    return `${cleanBaseUrl}/${cleanFilePath}`;
  }

  /**
   * Формирует URL для временных файлов
   * @param {string} fileName - имя файла
   * @returns {string} полный URL
   */
  getTempFileUrl(fileName) {
    if (!fileName) return null;
    const relativePath = path.join('uploads', 'temp', fileName).replace(/\\/g, '/');
    return this.getFileUrl(relativePath);
  }

  /**
   * Формирует URL для постоянных файлов
   * @param {string} userId - ID пользователя
   * @param {string} fileName - имя файла
   * @returns {string} полный URL
   */
  getPermanentFileUrl(userId, fileName) {
    if (!fileName) return null;
    const relativePath = path.join('uploads', 'users', userId, fileName).replace(/\\/g, '/');
    return this.getFileUrl(relativePath);
  }
}

module.exports = new ServerConfig();