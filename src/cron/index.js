// services/CronService.js
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger/logger');
const { performance } = require('perf_hooks');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      lastExecution: null
    };
  }

  /**
   * Инициализация всех крон-заданий
   */
  initialize() {
    logger.info('[CRON] Инициализация крон-сервиса');
    
    try {
      // Очистка временных файлов - каждый день в 3:00
      this.scheduleJob('tempFileCleanup', '0 3 * * *', () => 
        this.cleanupTempFiles()
      );

      // Проверка старых фидбеков - каждый понедельник в 4:00
      this.scheduleJob('feedbackCleanup', '0 4 * * 1', () => 
        this.cleanupOldFeedbacks()
      );

      // Мониторинг дискового пространства - каждый час
      this.scheduleJob('diskMonitor', '0 * * * *', () => 
        this.monitorDiskSpace()
      );

      // Статистика крон-заданий - каждые 10 минут (для отладки)
      if (process.env.NODE_ENV === 'development') {
        this.scheduleJob('cronStats', '*/10 * * * *', () => 
          this.logCronStats()
        );
      }

      logger.info(`[CRON] Запланировано ${this.jobs.size} заданий`);
      
    } catch (error) {
      logger.error('[CRON] Ошибка при инициализации:', error);
      throw error;
    }
  }

  /**
   * Запланировать крон-задание
   */
  scheduleJob(name, schedule, task) {
    if (this.jobs.has(name)) {
      logger.warn(`[CRON] Задание "${name}" уже существует, заменяем`);
      this.jobs.get(name).stop();
    }

    const job = cron.schedule(schedule, async () => {
      await this.executeTask(name, task);
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Europe/Moscow'
    });

    this.jobs.set(name, job);
    logger.info(`[CRON] Задание "${name}" запланировано: ${schedule}`);
  }

  /**
   * Выполнение задачи с мониторингом
   */
  async executeTask(name, task) {
    const startTime = performance.now();
    const executionId = Date.now();
    
    logger.info(`[CRON:${name}] Начало выполнения #${executionId}`);

    try {
      await task();
      
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      
      this.stats.totalExecutions++;
      this.stats.successfulExecutions++;
      this.stats.lastExecution = new Date();
      
      logger.info(`[CRON:${name}] Успешно выполнено #${executionId} за ${duration}ms`);
      
    } catch (error) {
      this.stats.totalExecutions++;
      this.stats.failedExecutions++;
      
      logger.error(`[CRON:${name}] Ошибка при выполнении #${executionId}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Отправляем уведомление при критических ошибках
      if (error.severity === 'critical') {
        await this.notifyAdminsAboutCronError(name, error);
      }
    }
  }

  /**
   * Очистка временных файлов
   */
  async cleanupTempFiles() {
    const startTime = Date.now();
    const config = {
      maxAgeHours: parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS) || 24,
      protectedFiles: ['readme.txt', '.gitkeep'],
      dryRun: process.env.CRON_DRY_RUN === 'true'
    };

    logger.info('[CRON:TEMP_CLEANUP] Начало очистки временных файлов', config);

    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const tempDir = path.join(uploadsDir, 'temp');
      
      // Проверяем существование директории
      try {
        await fs.access(tempDir);
      } catch {
        logger.info('[CRON:TEMP_CLEANUP] Директория temp не существует, пропускаем');
        return;
      }

      const files = await fs.readdir(tempDir);
      const now = Date.now();
      const maxAgeMs = config.maxAgeHours * 60 * 60 * 1000;
      
      let deletedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let totalSize = 0;

      for (const file of files) {
        // Пропускаем защищенные файлы
        if (config.protectedFiles.includes(file)) {
          logger.debug(`[CRON:TEMP_CLEANUP] Пропущен защищенный файл: ${file}`);
          skippedCount++;
          continue;
        }

        const filePath = path.join(tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > maxAgeMs) {
            if (!config.dryRun) {
              await fs.unlink(filePath);
              deletedCount++;
              totalSize += stats.size;
              
              logger.debug(`[CRON:TEMP_CLEANUP] Удален старый файл: ${file} (${Math.round(stats.size / 1024)}KB)`);
            } else {
              logger.info(`[CRON:TEMP_CLEANUP] DRY RUN: Будет удален ${file} (возраст: ${Math.round(fileAge / 3600000)}ч)`);
            }
          } else {
            skippedCount++;
          }
        } catch (error) {
          errorCount++;
          logger.warn(`[CRON:TEMP_CLEANUP] Ошибка при обработке файла ${file}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      const stats = {
        scanned: files.length,
        deleted: deletedCount,
        skipped: skippedCount,
        errors: errorCount,
        freedSpace: `${Math.round(totalSize / (1024 * 1024))}MB`,
        duration: `${duration}ms`,
        dryRun: config.dryRun
      };

      if (deletedCount > 0 || errorCount > 0) {
        logger.info('[CRON:TEMP_CLEANUP] Результаты очистки:', stats);
      } else {
        logger.debug('[CRON:TEMP_CLEANUP] Нечего удалять', stats);
      }

    } catch (error) {
      logger.error('[CRON:TEMP_CLEANUP] Критическая ошибка:', error);
      throw error;
    }
  }

  /**
   * Очистка старых фидбеков (опционально)
   */
  async cleanupOldFeedbacks() {
    logger.info('[CRON:FEEDBACK_CLEANUP] Начало очистки старых фидбеков');
    
    try {
      const { FeedbackModel } = require('../models/index.models');
      const retentionDays = parseInt(process.env.FEEDBACK_RETENTION_DAYS) || 365;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      // Находим фидбеки для удаления
      const oldFeedbacks = await FeedbackModel.find({
        status: { $in: ['closed', 'resolved'] },
        updatedAt: { $lt: cutoffDate }
      }).select('_id title status attachments');
      
      if (oldFeedbacks.length === 0) {
        logger.info('[CRON:FEEDBACK_CLEANUP] Старых фидбеков не найдено');
        return;
      }

      // Собираем файлы для удаления
      const filesToDelete = [];
      oldFeedbacks.forEach(feedback => {
        if (feedback.attachments && feedback.attachments.length > 0) {
          feedback.attachments.forEach(att => {
            if (att.permanentName) {
              filesToDelete.push(att.permanentName);
            }
          });
        }
      });

      // Удаляем файлы
      if (filesToDelete.length > 0 && process.env.CRON_DRY_RUN !== 'true') {
        await this.deleteFeedbackFiles(filesToDelete);
      }

      // Удаляем записи из БД
      const feedbackIds = oldFeedbacks.map(f => f._id);
      const deleteResult = await FeedbackModel.deleteMany({ 
        _id: { $in: feedbackIds } 
      });

      logger.info('[CRON:FEEDBACK_CLEANUP] Удалено фидбеков:', {
        count: deleteResult.deletedCount,
        fileCount: filesToDelete.length,
        retentionDays
      });

    } catch (error) {
      logger.error('[CRON:FEEDBACK_CLEANUP] Ошибка:', error);
      throw error;
    }
  }

  /**
   * Удаление файлов фидбеков
   */
  async deleteFeedbackFiles(fileNames) {
    const feedbackDir = path.join(__dirname, '..', 'uploads', 'feedback');
    let deletedCount = 0;
    let errorCount = 0;

    for (const fileName of fileNames) {
      const filePath = path.join(feedbackDir, fileName);
      
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        deletedCount++;
        logger.debug(`[CRON] Удален файл фидбека: ${fileName}`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`[CRON] Файл уже удален: ${fileName}`);
        } else {
          errorCount++;
          logger.warn(`[CRON] Ошибка при удалении файла ${fileName}:`, error.message);
        }
      }
    }

    return { deletedCount, errorCount };
  }

  /**
   * Мониторинг дискового пространства
   */
  async monitorDiskSpace() {
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      
      // Получаем статистику по директориям
      const dirStats = await this.getDirectoryStats(uploadsDir);
      
      // Проверяем лимиты
      const maxSizeMB = parseInt(process.env.MAX_UPLOADS_SIZE_MB) || 1024; // 1GB по умолчанию
      const currentSizeMB = Math.round(dirStats.totalSize / (1024 * 1024));
      const usagePercent = Math.round((currentSizeMB / maxSizeMB) * 100);
      
      if (usagePercent > 90) {
        logger.warn('[CRON:DISK_MONITOR] Критическое использование дискового пространства:', {
          currentSize: `${currentSizeMB}MB`,
          maxSize: `${maxSizeMB}MB`,
          usagePercent: `${usagePercent}%`,
          directories: dirStats.directories
        });
        
        // Можно отправить уведомление администраторам
        if (usagePercent > 95) {
          await this.notifyAdminsAboutDiskSpace(dirStats, usagePercent);
        }
      } else if (process.env.NODE_ENV === 'development') {
        logger.debug('[CRON:DISK_MONITOR] Статистика дискового пространства:', {
          currentSize: `${currentSizeMB}MB`,
          maxSize: `${maxSizeMB}MB`,
          usagePercent: `${usagePercent}%`
        });
      }

    } catch (error) {
      logger.error('[CRON:DISK_MONITOR] Ошибка мониторинга:', error);
    }
  }

  /**
   * Получение статистики директорий
   */
  async getDirectoryStats(dirPath) {
    const stats = {
      totalSize: 0,
      directories: {}
    };

    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const itemStat = await fs.stat(itemPath);
        
        if (itemStat.isDirectory()) {
          const dirSize = await this.calculateDirectorySize(itemPath);
          stats.directories[item] = {
            size: dirSize,
            sizeMB: Math.round(dirSize / (1024 * 1024)),
            files: await this.countFiles(itemPath)
          };
          stats.totalSize += dirSize;
        }
      }
    } catch (error) {
      logger.warn('[CRON] Ошибка при получении статистики директории:', error.message);
    }

    return stats;
  }

  /**
   * Расчет размера директории
   */
  async calculateDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          totalSize += await this.calculateDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch (error) {
      // Игнорируем ошибки доступа
    }
    
    return totalSize;
  }

  /**
   * Подсчет файлов в директории
   */
  async countFiles(dirPath) {
    let count = 0;
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          count += await this.countFiles(itemPath);
        } else {
          count++;
        }
      }
    } catch (error) {
      // Игнорируем ошибки доступа
    }
    
    return count;
  }

  /**
   * Логирование статистики крон-заданий
   */
  logCronStats() {
    logger.info('[CRON:STATS] Статистика выполнения:', {
      ...this.stats,
      activeJobs: this.jobs.size,
      uptime: `${process.uptime().toFixed(0)}s`
    });
  }

  /**
   * Уведомление администраторов об ошибке
   */
  async notifyAdminsAboutCronError(jobName, error) {
    // Здесь можно добавить отправку email/telegram уведомлений
    logger.error(`[CRON:ALERT] Критическая ошибка в задании ${jobName}:`, {
      message: error.message,
      time: new Date().toISOString()
    });
  }

  /**
   * Уведомление администраторов о дисковом пространстве
   */
  async notifyAdminsAboutDiskSpace(stats, usagePercent) {
    logger.error(`[CRON:ALERT] Критическое использование дискового пространства: ${usagePercent}%`, stats);
  }

  /**
   * Получение статуса всех заданий
   */
  getStatus() {
    return {
      active: this.jobs.size,
      stats: { ...this.stats },
      jobs: Array.from(this.jobs.keys()).map(name => ({
        name,
        nextRun: this.getNextRunTime(name),
        isRunning: this.isJobRunning(name)
      }))
    };
  }

  /**
   * Получение времени следующего запуска
   */
  getNextRunTime(jobName) {
    const job = this.jobs.get(jobName);
    if (job && job.nextDate) {
      return job.nextDate().toDate();
    }
    return null;
  }

  /**
   * Проверка выполнения задания
   */
  isJobRunning(jobName) {
    // node-cron не предоставляет эту информацию напрямую
    // Можно добавить кастомную логику отслеживания
    return false;
  }

  /**
   * Запуск задания вручную (для админки)
   */
  async runJobManually(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Задание "${jobName}" не найдено`);
    }

    logger.info(`[CRON] Ручной запуск задания: ${jobName}`);
    
    // Получаем функцию задания
    const tasks = {
      tempFileCleanup: () => this.cleanupTempFiles(),
      feedbackCleanup: () => this.cleanupOldFeedbacks(),
      diskMonitor: () => this.monitorDiskSpace()
    };

    if (tasks[jobName]) {
      return await this.executeTask(jobName, tasks[jobName]);
    }

    throw new Error(`Функция для задания "${jobName}" не определена`);
  }

  /**
   * Остановка всех заданий
   */
  stopAll() {
    logger.info('[CRON] Остановка всех заданий');
    this.jobs.forEach(job => job.stop());
    this.jobs.clear();
  }
}

module.exports = new CronService();