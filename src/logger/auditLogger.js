const fs = require('fs'); // Импортируем весь fs, а не только promises

const path = require('path');
const pino = require('pino');
const pinoPretty = require('pino-pretty');
const { multistream } = require('pino');

class AuditLogger {
  constructor() {
    // Используем абсолютный путь в контейнере
    this.logDir = '/app/src/logs';
    console.log('🔧 Инициализация логгера в:', this.logDir);
    
    // Проверяем и создаем структуру
    this.ensureDirectories();
    
    // Создаем простые синхронные логгеры без StreamManager
    this.loggers = this.createSimpleLoggers();
    
    console.log('✅ Логгер готов к работе');
    
    // Тестовое сообщение
    this.loggers.app.info('🔄 Логгер инициализирован');
  }
  
  ensureDirectories() {
    const dirs = [
      'audit/users/current',
      'audit/admins/current',
      'application',
      'errors',
      'access'
    ];

    dirs.forEach(dir => {
      const fullPath = path.join(this.logDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`📁 Создана директория: ${fullPath}`);
      }
    });
  }
  
  createSimpleLoggers() {
    console.log('🛠 Создаю логгеры...');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Пути к файлам
    const adminLogPath = path.join(this.logDir, 'audit/admins/current', `${today}.log`);
    const userLogPath = path.join(this.logDir, 'audit/users/current', `${today}.log`);
    const appLogPath = path.join(this.logDir, 'application', `${today}.log`);
    const errorLogPath = path.join(this.logDir, 'errors', `${today}.log`);
    const accessLogPath = path.join(this.logDir, 'access', `${today}.log`);
    
    console.log('📄 Пути к логам:');
    console.log('   Админские:', adminLogPath);
    console.log('   Пользовательские:', userLogPath);
    console.log('   Приложения:', appLogPath);
    
    // Создаем транспорты с СИНХРОННОЙ записью для отладки
    const createSyncTransport = (filePath) => {
      return pino.destination({
        dest: filePath,
        sync: true, // ВАЖНО: синхронная запись для отладки
        mkdir: true,
        minLength: 0, // Немедленная запись
      });
    };
    
    const loggers = {
      // Основной логгер приложения (в консоль + файл)
      app: pino(
        { 
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: {
            level: (label) => ({ level: label.toUpperCase() })
          }
        },
        multistream([
          {
            stream: pinoPretty({
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            }),
            level: 'info'
          },
          {
            stream: createSyncTransport(appLogPath),
            level: 'info'
          }
        ])
      ),
      
      // Логгер ошибок
      error: pino(
        { 
          level: 'error',
          timestamp: pino.stdTimeFunctions.isoTime
        },
        multistream([
          {
            stream: pinoPretty({
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            }),
            level: 'error'
          },
          {
            stream: createSyncTransport(errorLogPath),
            level: 'error'
          }
        ])
      ),
      
      // Аудит-логгер для админов (ТОЛЬКО файл)
      adminAudit: pino(
        { 
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime,
          messageKey: 'event',
          formatters: {
            level: (label) => ({ level: label.toUpperCase() })
          }
        },
        createSyncTransport(adminLogPath)
      ),
      
      // Аудит-логгер для пользователей (ТОЛЬКО файл)
      userAudit: pino(
        { 
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime,
          messageKey: 'event',
          formatters: {
            level: (label) => ({ level: label.toUpperCase() })
          }
        },
        createSyncTransport(userLogPath)
      ),
      
      // Логгер доступа
      access: pino(
        { 
          level: 'info',
          timestamp: pino.stdTimeFunctions.isoTime
        },
        createSyncTransport(accessLogPath)
      )
    };
    
    console.log('✅ Логгеры созданы');
    return loggers;
  }

  // Методы для аудита администраторов
  logAdminEvent(adminId, adminEmail, adminRole, event, action, targetUser = null, changes = [], justification = '') {
    try {
      console.log(`📝 Логирую admin event: ${event}`);
      
      const logData = {
        event,
        adminId,
        adminEmail,
        adminRole,
        action,
        auditType: 'ADMIN_ACTION',
        timestamp: new Date().toISOString()
      };
      
      if (targetUser) {
        logData.targetUserId = targetUser.id;
        logData.targetUserEmail = this.maskEmail(targetUser.email);
      }
      
      if (changes && changes.length > 0) {
        logData.changes = changes;
      }
      
      if (justification) {
        logData.justification = justification;
      }
      
      // ВАЖНО: Используем .info() с объектом
      this.loggers.adminAudit.info(logData);
      
      // Принудительно сбрасываем буфер
      this.loggers.adminAudit.flush();
      
      console.log(`✅ Admin event записан: ${event}`);
      
      // Для отладки также пишем в консоль
      console.log('📊 Данные лога:', JSON.stringify(logData, null, 2));
      
    } catch (error) {
      console.error('❌ Ошибка логирования административного события:', error);
      this.loggers.app.error({
        message: 'Ошибка логирования административного события',
        error: error.message,
        event,
        adminId
      });
    }
  }

  // Методы для аудита пользователей
  logUserEvent(userId, email, event, action, metadata = {}) {
    try {
      const maskedEmail = this.maskEmail(email);
      
      this.loggers.userAudit.info({
        event,
        userId,
        userEmail: maskedEmail,
        action,
        ...metadata,
        auditType: 'USER_ACTION',
        timestamp: new Date().toISOString()
      });
      
      this.loggers.userAudit.flush();
      
    } catch (error) {
      console.error('❌ Ошибка логирования пользовательского события:', error);
      this.loggers.app.error({
        message: 'Ошибка логирования пользовательского события',
        error: error.message,
        event,
        userId
      });
    }
  }

  maskEmail(email) {
    if (!email || typeof email !== 'string') {
      return 'invalid@email';
    }
    
    try {
      const [local, domain] = email.split('@');
      if (!local || !domain || !domain.includes('.')) {
        return 'invalid@email';
      }
      if (local.length <= 2) {
        return `${local[0]}***@${domain}`;
      }
      return `${local[0]}${local[1]}***@${domain}`;
    } catch (error) {
      return 'masked@email';
    }
  }
}

// Экспортируем синглтон
const auditLogger = new AuditLogger();
module.exports = auditLogger;