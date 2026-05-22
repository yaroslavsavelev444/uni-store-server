const axios = require('axios');
const EventEmitter = require('events');
const { taskQueues } = require('../queues/bull');

class TelegramNotifier extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.botToken = config.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = config.chatId || process.env.TELEGRAM_CHAT_ID;
    this.enabled = process.env.NODE_ENV === 'production' && this.botToken && this.chatId;
    this.rateLimit = config.rateLimit || { requests: 30, perSeconds: 1 };
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    // Кэш для предотвращения дублирования уведомлений
    this.notificationCache = new Map();
    this.cacheTTL = config.cacheTTL || 5 * 60 * 1000; // 5 минут
    
    // Очередь для управления rate limit
    this.queue = [];
    this.processing = false;
    
    // Счетчики для rate limiting
    this.requestCount = 0;
    this.lastReset = Date.now();
    
    // Автоматическая очистка кэша
    setInterval(() => this.cleanupCache(), 60 * 1000);
    
    // Отправка системного уведомления при старте
    if (this.enabled) {
      setTimeout(() => {
        this.sendSystemNotification('🚀 Logger initialized', {
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        }).catch(() => {}); // Игнорируем ошибки при старте
      }, 5000);
    }
  }
  
  async sendNotification(message, level = 'error', metadata = {}, options = {}) {
    if (!this.enabled) return null;
    
    // Используем очередь Bull вместо собственной
    return this.enqueueNotification(message, level, metadata, options);
  }
  
  async enqueueNotification(message, level = 'error', metadata = {}, options = {}) {
    try {
      const job = await taskQueues.add("sendTelegramNotification", {
        message,
        level,
        metadata,
        options
      });
      
      this.emit('queued', { message, level, metadata, jobId: job.id });
      return job.id;
    } catch (error) {
      this.emit('error', { message, level, metadata, error });
      console.error('Failed to enqueue Telegram notification:', error.message);
      return null;
    }
  }
  
  async processNotification(message, level, metadata, options) {
    // Этот метод будет вызываться из обработчика очереди
    if (!this.enabled) return null;
    
    // Проверяем rate limit
    if (!this.checkRateLimit()) {
      // Если превышен rate limit, возвращаем задачу в очередь с задержкой
      await new Promise(resolve => setTimeout(resolve, 1000));
      throw new Error('Rate limit exceeded, retrying...');
    }
    
    // Проверяем кэш для предотвращения дублирования
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
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: level === 'info' || options.silent === true
      };
      
      if (options.replyMarkup) {
        payload.reply_markup = options.replyMarkup;
      }
      
      // Отправка с ретраями
      const response = await this.sendWithRetry(url, payload);
      
      // Кэшируем успешную отправку
      this.cacheNotification(cacheKey);
      
      this.emit('sent', { message, level, metadata, response: response.data });
      return response.data;
    } catch (error) {
      this.emit('error', { message, level, metadata, error });
      
      // Для критических ошибок пробуем отправить fallback уведомление
      if (level === 'fatal' && error.response?.status !== 429) {
        await this.sendFallbackNotification(message, level);
      }
      
      throw error; // Пробрасываем ошибку для повторных попыток в Bull
    }
  }
  
  async sendSystemNotification(message, metadata = {}) {
    return this.sendNotification(message, 'info', {
      ...metadata,
      service: 'system',
      type: 'system'
    }, { silent: true });
  }
  
  async sendAlert(message, metadata = {}, options = {}) {
    return this.sendNotification(message, 'error', {
      ...metadata,
      service: 'alert',
      type: 'alert'
    }, options);
  }
  
  async sendBatch(messages) {
    if (!this.enabled || messages.length === 0) return [];
    
    // Для батч-отправки используем очередь для каждого сообщения
    const results = [];
    for (const msg of messages) {
      const level = msg.level || 'info';
      const result = await this.sendNotification(
        msg.message,
        level,
        msg.metadata,
        { silent: level === 'info' }
      );
      results.push(result);
    }
    
    return results;
  }
  
  formatMessage(message, level, metadata) {
    const emojiMap = {
      fatal: '💀',
      error: '🚨',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🐛',
      success: '✅'
    };
    
    const emoji = emojiMap[level] || '📝';
    const timestamp = metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : new Date().toLocaleString();
    
    let text = `${emoji} <b>${level.toUpperCase()}</b> - ${timestamp}\n`;
    text += `<pre>${this.escapeHtml(message.substring(0, 2000))}</pre>\n`;
    
    // Добавляем важные метаданные
    const importantFields = ['service', 'userId', 'adminId', 'ip', 'endpoint', 'statusCode', 'duration'];
    
    importantFields.forEach(field => {
      if (metadata[field]) {
        text += `\n<b>${field}:</b> <code>${metadata[field]}</code>`;
      }
    });
    
    // Добавляем трейс для ошибок
    if (metadata.stack && level === 'error') {
      const stackPreview = metadata.stack.split('\n').slice(0, 3).join('\n');
      text += `\n\n<b>Stack:</b>\n<pre>${this.escapeHtml(stackPreview)}</pre>`;
    }
    
    return text;
  }
  
  async sendWithRetry(url, payload, attempt = 1) {
    try {
      this.requestCount++;
      
      const response = await axios.post(url, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response;
    } catch (error) {
      if (attempt < this.retryAttempts && this.shouldRetry(error)) {
        await this.delay(this.retryDelay * attempt);
        return this.sendWithRetry(url, payload, attempt + 1);
      }
      throw error;
    }
  }
  
  async sendFallbackNotification(message, level) {
    // Резервный метод отправки уведомлений
    console.error('FALLBACK NEEDED:', { message, level });
  }
  
  checkRateLimit() {
    const now = Date.now();
    const timePassed = now - this.lastReset;
    
    if (timePassed > this.rateLimit.perSeconds * 1000) {
      this.requestCount = 0;
      this.lastReset = now;
      return true;
    }
    
    return this.requestCount < this.rateLimit.requests;
  }
  
  generateCacheKey(message, level, metadata) {
    const keyParts = [
      level,
      message.substring(0, 100),
      metadata.userId,
      metadata.service,
      Math.floor(Date.now() / (5 * 60 * 1000))
    ].filter(Boolean);
    
    return keyParts.join('|');
  }
  
  isDuplicate(cacheKey) {
    return this.notificationCache.has(cacheKey);
  }
  
  cacheNotification(cacheKey) {
    this.notificationCache.set(cacheKey, Date.now());
  }
  
  cleanupCache() {
    const now = Date.now();
    for (const [key, timestamp] of this.notificationCache.entries()) {
      if (now - timestamp > this.cacheTTL) {
        this.notificationCache.delete(key);
      }
    }
  }
  
  shouldRetry(error) {
    if (!error.response) return true;
    return error.response.status >= 500;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // Методы для управления
  enable() {
    this.enabled = true;
  }
  
  disable() {
    this.enabled = false;
  }
  
  setChatId(chatId) {
    this.chatId = chatId;
  }
  
  getStats() {
    return {
      enabled: this.enabled,
      cacheSize: this.notificationCache.size,
      requestCount: this.requestCount,
      lastReset: new Date(this.lastReset).toISOString()
    };
  }
}

// Создаем экземпляр
const telegramNotifier = new TelegramNotifier();

// Экспортируем экземпляр и класс
module.exports = telegramNotifier;
module.exports.TelegramNotifier = TelegramNotifier;