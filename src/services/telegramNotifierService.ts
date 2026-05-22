import EventEmitter from "node:events";
import fs from "node:fs";
import axios, { type AxiosError, type AxiosResponse } from "axios";
import FormData from "form-data";
import logger from "../logger/logger.js";
import { taskQueues } from "../queues/bull.js";
// ========== Типы ==========
export type NotificationLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "success";

// Тип ответа от Telegram API (упрощённый)
export interface TelegramResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number; [key: string]: unknown };
    date: number;
    text: string;
  };
  description?: string;
  error_code?: number;
}

export type TelegramSendResult = AxiosResponse<TelegramResponse> | null;

export interface TelegramNotifierConfig {
  botToken?: string;
  chatId?: string | number;
  enabled?: boolean;
  rateLimit?: { requests: number; perSeconds: number };
  retryAttempts?: number;
  retryDelay?: number;
  cacheTTL?: number;
}

export interface NotificationOptions {
  silent?: boolean;
  replyMarkup?: unknown; // конкретный тип от Telegram (InlineKeyboardMarkup), но для общности unknown
  [key: string]: unknown;
}

export interface NotificationMetadata {
  timestamp?: string;
  service?: string;
  userId?: string;
  adminId?: string;
  ip?: string;
  endpoint?: string;
  statusCode?: number;
  duration?: number;
  stack?: string;
  [key: string]: unknown;
}

export interface QueuedNotification {
  message: string;
  level: NotificationLevel;
  metadata: NotificationMetadata;
  options: NotificationOptions;
  jobId?: string;
}

// ========== Класс ==========
class TelegramNotifier extends EventEmitter {
  private readonly botToken: string;
  private chatId: string | number; // убрали readonly, чтобы можно было менять через setChatId
  private enabled: boolean;
  private readonly rateLimit: { requests: number; perSeconds: number };
  private readonly retryAttempts: number;
  private readonly retryDelay: number;
  private readonly cacheTTL: number;
  private notificationCache: Map<string, number>;
  private requestCount: number;
  private lastReset: number;

  constructor(config: TelegramNotifierConfig = {}) {
    super();

    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID || "";
    this.enabled =
      config.enabled !== undefined
        ? config.enabled
        : process.env.NODE_ENV === "production" &&
          !!this.botToken &&
          !!this.chatId;
    this.rateLimit = config.rateLimit || { requests: 30, perSeconds: 1 };
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.cacheTTL = config.cacheTTL || 5 * 60 * 1000; // 5 минут

    this.notificationCache = new Map();
    this.requestCount = 0;
    this.lastReset = Date.now();

    setInterval(() => this.cleanupCache(), 60 * 1000);

    if (this.enabled) {
      setTimeout(() => {
        this.sendSystemNotification("🚀 Telegram notifier initialized", {
          environment: process.env.NODE_ENV,
        }).catch(() => {});
      }, 5000);
    }
  }

  // Публичный API
  public async sendNotification(
    message: string,
    level: NotificationLevel = "error",
    metadata: NotificationMetadata = {},
    options: NotificationOptions = {},
  ): Promise<string | null> {
    if (!this.enabled) return null;
    return this.enqueueNotification(message, level, metadata, options);
  }

  public async sendSystemNotification(
    message: string,
    metadata: NotificationMetadata = {},
  ): Promise<string | null> {
    return this.sendNotification(
      message,
      "info",
      { ...metadata, service: "system", type: "system" },
      { silent: true },
    );
  }

  public async sendAlert(
    message: string,
    metadata: NotificationMetadata = {},
    options: NotificationOptions = {},
  ): Promise<string | null> {
    return this.sendNotification(
      message,
      "error",
      { ...metadata, service: "alert", type: "alert" },
      options,
    );
  }

  public async sendBatch(
    messages: Array<{
      message: string;
      level?: NotificationLevel;
      metadata?: NotificationMetadata;
    }>,
  ): Promise<(string | null)[]> {
    const results: (string | null)[] = [];
    for (const msg of messages) {
      const level = msg.level || "info";
      const result = await this.sendNotification(
        msg.message,
        level,
        msg.metadata || {},
        { silent: level === "info" },
      );
      results.push(result);
    }
    return results;
  }

  // Внутренние методы
  private async enqueueNotification(
    message: string,
    level: NotificationLevel,
    metadata: NotificationMetadata,
    options: NotificationOptions,
  ): Promise<string | null> {
    try {
      const job = await taskQueues.add("sendTelegramNotification", {
        message,
        level,
        metadata,
        options,
      });
      this.emit("queued", { message, level, metadata, jobId: job.id });
      return job.id as string;
    } catch (error) {
      this.emit("error", { message, level, metadata, error });
      logger.error({
        message: "Error adding Telegram notification task",
        error: error as Error,
      });
      return null;
    }
  }

  // Этот метод вызывается из Bull‑обработчика
  public async processNotification(
    message: string,
    level: NotificationLevel,
    metadata: NotificationMetadata,
    options: NotificationOptions,
  ): Promise<TelegramSendResult> {
    if (!this.enabled) return null;

    if (!this.checkRateLimit()) {
      await this.delay(1000);
      throw new Error("Rate limit exceeded, retrying...");
    }

    const cacheKey = this.generateCacheKey(message, level, metadata);
    if (this.isDuplicate(cacheKey)) {
      return null;
    }

    try {
      const formattedMessage = this.formatMessage(message, level, metadata);
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload = {
        chat_id: this.chatId,
        text: formattedMessage,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        disable_notification: level === "info" || options.silent === true,
        //@ts-expect-error
        ...(options.replyMarkup && { reply_markup: options.replyMarkup }),
      };

      const response = await this.sendWithRetry(url, payload);
      this.cacheNotification(cacheKey);
      this.emit("sent", { message, level, metadata, response: response.data });
      return response;
    } catch (error) {
      this.emit("error", { message, level, metadata, error });
      if (level === "fatal") {
        await this.sendFallbackNotification(message, level);
      }
      throw error;
    }
  }

  private formatMessage(
    message: string,
    level: NotificationLevel,
    metadata: NotificationMetadata,
  ): string {
    const emojiMap: Record<NotificationLevel, string> = {
      fatal: "💀",
      error: "🚨",
      warn: "⚠️",
      info: "ℹ️",
      debug: "🐛",
      success: "✅",
    };
    const emoji = emojiMap[level] || "📝";
    const timestamp = metadata.timestamp
      ? new Date(metadata.timestamp).toLocaleString()
      : new Date().toLocaleString();

    let text = `${emoji} <b>${level.toUpperCase()}</b> - ${timestamp}\n`;
    text += `<pre>${this.escapeHtml(message.substring(0, 2000))}</pre>\n`;

    const importantFields = [
      "service",
      "userId",
      "adminId",
      "ip",
      "endpoint",
      "statusCode",
      "duration",
    ];
    for (const field of importantFields) {
      if (metadata[field]) {
        text += `\n<b>${field}:</b> <code>${metadata[field]}</code>`;
      }
    }

    if (metadata.stack && level === "error") {
      const stackPreview = metadata.stack.split("\n").slice(0, 3).join("\n");
      text += `\n\n<b>Stack:</b>\n<pre>${this.escapeHtml(stackPreview)}</pre>`;
    }

    return text;
  }

  // Тип для payload – объект с полями, которые ожидает Telegram
  private async sendWithRetry(
    url: string,
    payload: {
      chat_id: string | number;
      text: string;
      parse_mode: string;
      disable_web_page_preview: boolean;
      disable_notification: boolean;
      reply_markup?: unknown;
    },
    attempt: number = 1,
  ): Promise<AxiosResponse<TelegramResponse>> {
    try {
      this.requestCount++;
      return await axios.post<TelegramResponse>(url, payload, {
        timeout: 10000,
      });
    } catch (error) {
      const axiosError = error as AxiosError;
      if (attempt < this.retryAttempts && this.shouldRetry(axiosError)) {
        await this.delay(this.retryDelay * attempt);
        return this.sendWithRetry(url, payload, attempt + 1);
      }
      throw error;
    }
  }

  private async sendFallbackNotification(
    _message: string,
    _level: NotificationLevel,
  ): Promise<void> {
    logger.error("Fallback: Telegram notification failed");
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const timePassed = now - this.lastReset;
    if (timePassed > this.rateLimit.perSeconds * 1000) {
      this.requestCount = 0;
      this.lastReset = now;
      return true;
    }
    return this.requestCount < this.rateLimit.requests;
  }

  private generateCacheKey(
    message: string,
    level: NotificationLevel,
    metadata: NotificationMetadata,
  ): string {
    const timeSlot = Math.floor(Date.now() / (5 * 60 * 1000));
    const parts = [
      level,
      message.substring(0, 100),
      metadata.userId,
      metadata.service,
      timeSlot,
    ].filter(Boolean);
    return parts.join("|");
  }

  private isDuplicate(key: string): boolean {
    return this.notificationCache.has(key);
  }

  private cacheNotification(key: string): void {
    this.notificationCache.set(key, Date.now());
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.notificationCache.entries()) {
      if (now - timestamp > this.cacheTTL) {
        this.notificationCache.delete(key);
      }
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    return !error.response || error.response.status >= 500;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Методы управления
  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }

  public setChatId(chatId: string | number): void {
    this.chatId = chatId;
  }

  public getStats(): object {
    return {
      enabled: this.enabled,
      cacheSize: this.notificationCache.size,
      requestCount: this.requestCount,
      lastReset: new Date(this.lastReset).toISOString(),
    };
  }

  /**
   * Отправка файла (документа) в Telegram
   * @param filePath абсолютный путь к файлу
   * @param caption подпись
   * @param metadata метаданные (логируются)
   * @param options опции (disable_notification и т.п.)
   */
  public async sendDocument(
    filePath: string,
    caption: string = "📦 Файл",
    metadata: NotificationMetadata = {},
    options: NotificationOptions = {},
  ): Promise<AxiosResponse<TelegramResponse> | null> {
    if (!this.enabled) return null;
    if (!this.checkRateLimit()) {
      await this.delay(1000);
      throw new Error("Rate limit exceeded, retrying...");
    }

    // Проверяем существование файла и размер (Telegram ограничение 50 MB)
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const stats = fs.statSync(filePath);
    const maxSize = 50 * 1024 * 1024; // 50 MB
    if (stats.size > maxSize) {
      throw new Error(`File too large: ${stats.size} bytes (max ${maxSize})`);
    }

    const cacheKey = `file:${filePath}:${stats.mtimeMs}`;
    if (this.isDuplicate(cacheKey)) {
      logger.debug(`Duplicate file send skipped: ${filePath}`);
      return null;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
      const formData = new FormData();
      formData.append("chat_id", this.chatId);
      formData.append("document", fs.createReadStream(filePath));
      if (caption) formData.append("caption", caption.substring(0, 1024));
      formData.append("parse_mode", "HTML");
      if (options.silent || metadata.level === "info") {
        formData.append("disable_notification", "true");
      }
      if (options.replyMarkup) {
        formData.append("reply_markup", JSON.stringify(options.replyMarkup));
      }

      const response = await this.sendWithRetryFile(url, formData);
      this.cacheNotification(cacheKey);
      this.emit("sent", {
        filePath,
        caption,
        metadata,
        response: response.data,
      });
      return response;
    } catch (error) {
      this.emit("error", { filePath, caption, metadata, error });
      logger.error({
        message: "Error sending document",
        error: (error as Error).message,
        filePath,
      });
      throw error;
    }
  }

  /**
   * Отправка FormData с повторными попытками (для файлов)
   */
  private async sendWithRetryFile(
    url: string,
    formData: any,
    attempt: number = 1,
  ): Promise<AxiosResponse<TelegramResponse>> {
    try {
      this.requestCount++;
      return await axios.post<TelegramResponse>(url, formData, {
        headers: formData.getHeaders(),
        timeout: 60000, // больше таймаут для файлов
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (error) {
      const axiosError = error as AxiosError;
      if (attempt < this.retryAttempts && this.shouldRetry(axiosError)) {
        await this.delay(this.retryDelay * attempt);
        return this.sendWithRetryFile(url, formData, attempt + 1);
      }
      throw error;
    }
  }
}

// Экспортируем единственный экземпляр
const telegramNotifier = new TelegramNotifier();
export default telegramNotifier;
export { TelegramNotifier };
