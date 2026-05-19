// services/CronService.ts
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import logger from "../logger/logger.js";
import indexModels from "../models/index.models.js";

// Определяем __dirname для ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Типы для опций окружения
interface TempCleanupConfig {
  maxAgeHours: number;
  protectedFiles: string[];
  dryRun: boolean;
}

interface DirectoryStats {
  totalSize: number;
  directories: Record<
    string,
    {
      size: number;
      sizeMB: number;
      files: number;
    }
  >;
}

interface CronStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastExecution: Date | null;
}

interface JobStatus {
  name: string;
  nextRun: Date | null;
  isRunning: boolean;
}

class CronService {
  private jobs: Map<string, cron.ScheduledTask>;
  private stats: CronStats;

  constructor() {
    this.jobs = new Map();
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      lastExecution: null,
    };
  }

  /**
   * Инициализация всех крон-заданий
   */
  public initialize(): void {
    logger.info("[CRON] Инициализация крон-сервиса");

    try {
      // Очистка временных файлов - каждый день в 3:00
      // this.scheduleJob('tempFileCleanup', '0 3 * * *', () =>
      //   this.cleanupTempFiles()
      // );

      // // Проверка старых фидбеков - каждый понедельник в 4:00
      // this.scheduleJob('feedbackCleanup', '0 4 * * 1', () =>
      //   this.cleanupOldFeedbacks()
      // );

      // // Мониторинг дискового пространства - каждый час
      // this.scheduleJob('diskMonitor', '0 * * * *', () =>
      //   this.monitorDiskSpace()
      // );

      // // Статистика крон-заданий - каждые 10 минут (для отладки)
      // if (process.env.NODE_ENV === 'development') {
      //   this.scheduleJob('cronStats', '*/10 * * * *', () =>
      //     this.logCronStats()
      //   );
      // }

      logger.info(`[CRON] Запланировано ${this.jobs.size} заданий`);
    } catch (error) {
      logger.error("[CRON] Ошибка при инициализации:", error);
      throw error;
    }
  }

  /**
   * Запланировать крон-задание
   */
  public scheduleJob(
    name: string,
    schedule: string,
    task: () => Promise<void> | void,
  ): void {
    if (this.jobs.has(name)) {
      logger.warn(`[CRON] Задание "${name}" уже существует, заменяем`);
      this.jobs.get(name)!.stop();
    }

    const job = cron.schedule(
      schedule,
      async () => {
        await this.executeTask(name, task);
      },
      {
        timezone: process.env.TIMEZONE || "Europe/Moscow",
      },
    );

    this.jobs.set(name, job);
    logger.info(`[CRON] Задание "${name}" запланировано: ${schedule}`);
  }

  /**
   * Выполнение задачи с мониторингом
   */
  private async executeTask(
    name: string,
    task: () => Promise<void> | void,
  ): Promise<void> {
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

      logger.info(
        `[CRON:${name}] Успешно выполнено #${executionId} за ${duration}ms`,
      );
    } catch (error: any) {
      this.stats.totalExecutions++;
      this.stats.failedExecutions++;

      logger.error(`[CRON:${name}] Ошибка при выполнении #${executionId}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Отправляем уведомление при критических ошибках
      if (error.severity === "critical") {
        await this.notifyAdminsAboutCronError(name, error);
      }
    }
  }

  /**
   * Очистка временных файлов
   */
  public async cleanupTempFiles(): Promise<void> {
    const startTime = Date.now();
    const config: TempCleanupConfig = {
      maxAgeHours: parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS || "24", 10),
      protectedFiles: ["readme.txt", ".gitkeep"],
      dryRun: process.env.CRON_DRY_RUN === "true",
    };

    logger.info({
      message: "[CRON:TEMP_CLEANUP] Начало очистки временных файлов",
      maxAgeHours: config.maxAgeHours,
      protectedFiles: config.protectedFiles,
      dryRun: config.dryRun,
    });

    try {
      const uploadsDir = join(__dirname, "..", "uploads");
      const tempDir = join(uploadsDir, "temp");

      // Проверяем существование директории
      try {
        await fs.access(tempDir);
      } catch {
        logger.info(
          "[CRON:TEMP_CLEANUP] Директория temp не существует, пропускаем",
        );
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

        const filePath = join(tempDir, file);

        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.mtimeMs;

          if (fileAge > maxAgeMs) {
            if (!config.dryRun) {
              await fs.unlink(filePath);
              deletedCount++;
              totalSize += stats.size;

              logger.debug(
                `[CRON:TEMP_CLEANUP] Удален старый файл: ${file} (${Math.round(stats.size / 1024)}KB)`,
              );
            } else {
              logger.info(
                `[CRON:TEMP_CLEANUP] DRY RUN: Будет удален ${file} (возраст: ${Math.round(fileAge / 3600000)}ч)`,
              );
            }
          } else {
            skippedCount++;
          }
        } catch (error: any) {
          errorCount++;
          logger.warn({
            message: `[CRON:TEMP_CLEANUP] Ошибка при удалении файлы: ${file}`,
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      const resultStats = {
        scanned: files.length,
        deleted: deletedCount,
        skipped: skippedCount,
        errors: errorCount,
        freedSpace: `${Math.round(totalSize / (1024 * 1024))}MB`,
        duration: `${duration}ms`,
        dryRun: config.dryRun,
      };

      if (deletedCount > 0 || errorCount > 0) {
        logger.info({
          message: "[CRON:TEMP_CLEANUP] Результаты очистки:",
          resultStats,
        });
      } else {
        logger.debug({
          message: "[CRON:TEMP_CLEANUP] Результаты очистки:",
          resultStats,
        });
      }
    } catch (error: any) {
      logger.error("[CRON:TEMP_CLEANUP] Критическая ошибка:", error);
      throw error;
    }
  }

  /**
   * Очистка старых фидбеков (опционально)
   */
  public async cleanupOldFeedbacks(): Promise<void> {
    logger.info("[CRON:FEEDBACK_CLEANUP] Начало очистки старых фидбеков");

    try {
      const { FeedbackModel } = indexModels;
      const retentionDays = parseInt(
        process.env.FEEDBACK_RETENTION_DAYS || "365",
        10,
      );
      const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );

      // Находим фидбеки для удаления
      const oldFeedbacks = await FeedbackModel.find({
        status: { $in: ["closed", "resolved"] },
        updatedAt: { $lt: cutoffDate },
      }).select("_id title status attachments");

      if (oldFeedbacks.length === 0) {
        logger.info("[CRON:FEEDBACK_CLEANUP] Старых фидбеков не найдено");
        return;
      }

      // Собираем файлы для удаления
      const filesToDelete: string[] = [];
      for (const feedback of oldFeedbacks) {
        if (feedback.attachments && feedback.attachments.length > 0) {
          for (const att of feedback.attachments) {
            if (att.permanentName) {
              filesToDelete.push(att.permanentName);
            }
          }
        }
      }

      // Удаляем файлы
      if (filesToDelete.length > 0 && process.env.CRON_DRY_RUN !== "true") {
        await this.deleteFeedbackFiles(filesToDelete);
      }

      // Удаляем записи из БД
      const feedbackIds = oldFeedbacks.map((f: any) => f._id);
      const deleteResult = await FeedbackModel.deleteMany({
        _id: { $in: feedbackIds },
      });

      logger.info({
        message: "[CRON:FEEDBACK_CLEANUP] Удалено фидбеков",
        count: deleteResult.deletedCount,
      });
    } catch (error: any) {
      logger.error("[CRON:FEEDBACK_CLEANUP] Ошибка:", error);
      throw error;
    }
  }

  /**
   * Удаление файлов фидбеков
   */
  private async deleteFeedbackFiles(
    fileNames: string[],
  ): Promise<{ deletedCount: number; errorCount: number }> {
    const feedbackDir = join(__dirname, "..", "uploads", "feedback");
    let deletedCount = 0;
    let errorCount = 0;

    for (const fileName of fileNames) {
      const filePath = join(feedbackDir, fileName);

      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        deletedCount++;
        logger.debug(`[CRON] Удален файл фидбека: ${fileName}`);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          logger.debug(`[CRON] Файл уже удален: ${fileName}`);
        } else {
          errorCount++;
          logger.warn({
            message: `[CRON] Ошибка при удалении файла фидбека: ${fileName}`,
            error: error.message,
          });
        }
      }
    }

    return { deletedCount, errorCount };
  }

  /**
   * Мониторинг дискового пространства
   */
  public async monitorDiskSpace(): Promise<void> {
    try {
      const uploadsDir = join(__dirname, "..", "uploads");

      // Получаем статистику по директориям
      const dirStats = await this.getDirectoryStats(uploadsDir);

      // Проверяем лимиты
      const maxSizeMB = parseInt(process.env.MAX_UPLOADS_SIZE_MB || "1024", 10);
      const currentSizeMB = Math.round(dirStats.totalSize / (1024 * 1024));
      const usagePercent = Math.round((currentSizeMB / maxSizeMB) * 100);

      if (usagePercent > 90) {
        logger.warn({
          currentSize: `${currentSizeMB}MB`,
          maxSize: `${maxSizeMB}MB`,
          usagePercent: `${usagePercent}%`,
          directories: dirStats.directories,
        });

        // Можно отправить уведомление администраторам
        if (usagePercent > 95) {
          await this.notifyAdminsAboutDiskSpace(dirStats, usagePercent);
        }
      } else if (process.env.NODE_ENV === "development") {
        logger.debug({
          currentSize: `${currentSizeMB}MB`,
          maxSize: `${maxSizeMB}MB`,
          usagePercent: `${usagePercent}%`,
          directories: dirStats.directories,
        });
      }
    } catch (error: any) {
      logger.error("[CRON:DISK_MONITOR] Ошибка мониторинга:", error);
    }
  }

  /**
   * Получение статистики директорий
   */
  private async getDirectoryStats(dirPath: string): Promise<DirectoryStats> {
    const stats: DirectoryStats = {
      totalSize: 0,
      directories: {},
    };

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const itemStat = await fs.stat(itemPath);

        if (itemStat.isDirectory()) {
          const dirSize = await this.calculateDirectorySize(itemPath);
          stats.directories[item] = {
            size: dirSize,
            sizeMB: Math.round(dirSize / (1024 * 1024)),
            files: await this.countFiles(itemPath),
          };
          stats.totalSize += dirSize;
        }
      }
    } catch (error: any) {
      logger.warn(
        "[CRON:DISK_MONITOR] Ошибка при получении статистики директорий:",
      );
    }

    return stats;
  }

  /**
   * Расчет размера директории
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          totalSize += await this.calculateDirectorySize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch {
      // Игнорируем ошибки доступа
    }

    return totalSize;
  }

  /**
   * Подсчет файлов в директории
   */
  private async countFiles(dirPath: string): Promise<number> {
    let count = 0;

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          count += await this.countFiles(itemPath);
        } else {
          count++;
        }
      }
    } catch {
      // Игнорируем ошибки доступа
    }

    return count;
  }

  /**
   * Логирование статистики крон-заданий
   */
  public logCronStats(): void {
    logger.info({
      message: "Статистика крон-заданий",
      time: new Date().toISOString(),
    });
  }

  /**
   * Уведомление администраторов об ошибке
   */
  private async notifyAdminsAboutCronError(
    jobName: string,
    error: Error,
  ): Promise<void> {
    // Здесь можно добавить отправку email/telegram уведомлений
    logger.error(`[CRON:ALERT] Критическая ошибка в задании ${jobName}:`, {
      message: error.message,
      time: new Date().toISOString(),
    });
  }

  /**
   * Уведомление администраторов о дисковом пространстве
   */
  private async notifyAdminsAboutDiskSpace(
    stats: DirectoryStats,
    usagePercent: number,
  ): Promise<void> {
    logger.error(
      `[CRON:ALERT] Критическое использование дискового пространства: ${usagePercent}%`,
      stats,
    );
  }

  /**
   * Получение статуса всех заданий
   */
  public getStatus(): { active: number; stats: CronStats; jobs: JobStatus[] } {
    return {
      active: this.jobs.size,
      stats: { ...this.stats },
      jobs: Array.from(this.jobs.keys()).map((name) => ({
        name,
        nextRun: this.getNextRunTime(name),
        isRunning: this.isJobRunning(name),
      })),
    };
  }

  /**
   * Получение времени следующего запуска
   */
  private getNextRunTime(_jobName: string): Date | null {
    // node-cron не предоставляет эту информацию напрямую
    return null;
  }

  /**
   * Проверка выполнения задания
   */
  private isJobRunning(_jobName: string): boolean {
    // node-cron не предоставляет эту информацию напрямую
    return false;
  }

  /**
   * Запуск задания вручную (для админки)
   */
  public async runJobManually(jobName: string): Promise<void> {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Задание "${jobName}" не найдено`);
    }

    logger.info(`[CRON] Ручной запуск задания: ${jobName}`);

    // Получаем функцию задания
    const tasks: Record<string, () => Promise<void>> = {
      tempFileCleanup: () => this.cleanupTempFiles(),
      feedbackCleanup: () => this.cleanupOldFeedbacks(),
      diskMonitor: () => this.monitorDiskSpace(),
    };

    if (tasks[jobName]) {
      return await this.executeTask(jobName, tasks[jobName]);
    }

    throw new Error(`Функция для задания "${jobName}" не определена`);
  }

  /**
   * Остановка всех заданий
   */
  public stopAll(): void {
    logger.info("[CRON] Остановка всех заданий");
    this.jobs.forEach((job) => job.stop());
    this.jobs.clear();
  }
}

export default new CronService();
