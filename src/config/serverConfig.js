const path = require('path');

class ServerConfig {
  constructor() {
    // Определяем режим
    this.isProd = process.env.NODE_ENV === 'production';
    
    // Протокол по умолчанию
    this.protocol = this.isProd ? 'https' : 'http';
    
    // Хост и порт сервера
    this.host = process.env.HOST || 'localhost';
    this.port = process.env.PORT || 3003;

    // Базовый URL для API
    this.baseUrl = process.env.BASE_URL || `${this.protocol}://${this.host}:${this.port}`;

    // Базовый URL для публичного доступа к файлам
    // В проде желательно задавать отдельный PUBLIC_BASE_URL или FILES_BASE_URL
    this.filesBaseUrl = process.env.FILES_BASE_URL || process.env.PUBLIC_BASE_URL || this.baseUrl;

    // Директории загрузки (относительно cwd)
    this.uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
    this.tempDir = path.join(this.uploadsDir, 'temp');
    this.usersDir = path.join(this.uploadsDir, 'users');
  }

  /**
   * Формирует полный URL до любого файла
   * @param {string} filePath - относительный путь к файлу
   */
  getFileUrl(filePath) {
    if (!filePath) return null;

    // Если уже полный URL — возвращаем как есть
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    // Убираем ведущий слэш
    const cleanFilePath = filePath.replace(/^\/+/, '');
    const cleanBaseUrl = this.filesBaseUrl.replace(/\/+$/, '');

    return `${cleanBaseUrl}/${cleanFilePath}`;
  }

  /**
   * URL для временных файлов
   * @param {string} fileName
   */
  getTempFileUrl(fileName) {
    if (!fileName) return null;
    const relativePath = path.posix.join('uploads', 'temp', fileName);
    return this.getFileUrl(relativePath);
  }

  /**
   * URL для постоянных файлов пользователя
   * @param {string} userId
   * @param {string} fileName
   */
  getPermanentFileUrl(userId, fileName) {
    if (!fileName || !userId) return null;
    const relativePath = path.posix.join('uploads', 'users', userId, fileName);
    return this.getFileUrl(relativePath);
  }

  /**
   * Публичный путь к temp директории на диске
   */
  getTempDir() {
    return this.tempDir;
  }

  /**
   * Публичный путь к users директории на диске
   */
  getUsersDir() {
    return this.usersDir;
  }
}

module.exports = new ServerConfig();