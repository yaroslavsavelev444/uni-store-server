// config/cron.config.js
module.exports = {
  // Настройки крон-заданий
  jobs: {
    tempFileCleanup: {
      schedule: process.env.CRON_TEMP_CLEANUP || '0 3 * * *', // Каждый день в 3:00
      enabled: process.env.CRON_TEMP_CLEANUP_ENABLED !== 'false',
      maxAgeHours: parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS) || 24,
      dryRun: process.env.CRON_DRY_RUN === 'true'
    },
    feedbackCleanup: {
      schedule: process.env.CRON_FEEDBACK_CLEANUP || '0 4 * * 1', // Каждый понедельник в 4:00
      enabled: process.env.CRON_FEEDBACK_CLEANUP_ENABLED !== 'false',
      retentionDays: parseInt(process.env.FEEDBACK_RETENTION_DAYS) || 365
    },
    diskMonitor: {
      schedule: process.env.CRON_DISK_MONITOR || '0 * * * *', // Каждый час
      enabled: process.env.CRON_DISK_MONITOR_ENABLED !== 'false',
      maxSizeMB: parseInt(process.env.MAX_UPLOADS_SIZE_MB) || 1024,
      alertThreshold: parseInt(process.env.DISK_ALERT_THRESHOLD) || 90
    }
  },

  // Настройки уведомлений
  notifications: {
    enabled: process.env.CRON_NOTIFICATIONS_ENABLED === 'true',
    email: process.env.CRON_ADMIN_EMAIL,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    }
  },

  // Общие настройки
  timezone: process.env.TIMEZONE || 'Europe/Moscow',
  logLevel: process.env.CRON_LOG_LEVEL || 'info'
};