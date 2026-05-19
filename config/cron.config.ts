// config/cron.config.ts
interface BaseJobConfig {
  schedule: string;
  enabled: boolean;
}

interface TempFileCleanupJob extends BaseJobConfig {
  maxAgeHours: number;
  dryRun: boolean;
}

interface FeedbackCleanupJob extends BaseJobConfig {
  retentionDays: number;
}

interface DiskMonitorJob extends BaseJobConfig {
  maxSizeMB: number;
  alertThreshold: number;
}

interface CronJobsConfig {
  tempFileCleanup: TempFileCleanupJob;
  feedbackCleanup: FeedbackCleanupJob;
  diskMonitor: DiskMonitorJob;
}

interface NotificationsConfig {
  enabled: boolean;
  email?: string;
  telegram: {
    botToken?: string;
    chatId?: string;
  };
}

interface CronConfig {
  jobs: CronJobsConfig;
  notifications: NotificationsConfig;
  timezone: string;
  logLevel: string;
}

const config: CronConfig = {
  jobs: {
    tempFileCleanup: {
      schedule: process.env.CRON_TEMP_CLEANUP || "0 3 * * *",
      enabled: process.env.CRON_TEMP_CLEANUP_ENABLED !== "false",
      maxAgeHours: parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS || "24", 10),
      dryRun: process.env.CRON_DRY_RUN === "true",
    },
    feedbackCleanup: {
      schedule: process.env.CRON_FEEDBACK_CLEANUP || "0 4 * * 1",
      enabled: process.env.CRON_FEEDBACK_CLEANUP_ENABLED !== "false",
      retentionDays: parseInt(process.env.FEEDBACK_RETENTION_DAYS || "365", 10),
    },
    diskMonitor: {
      schedule: process.env.CRON_DISK_MONITOR || "0 * * * *",
      enabled: process.env.CRON_DISK_MONITOR_ENABLED !== "false",
      maxSizeMB: parseInt(process.env.MAX_UPLOADS_SIZE_MB || "1024", 10),
      alertThreshold: parseInt(process.env.DISK_ALERT_THRESHOLD || "90", 10),
    },
  },
  notifications: {
    enabled: process.env.CRON_NOTIFICATIONS_ENABLED === "true",
    email: process.env.CRON_ADMIN_EMAIL,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
  },
  timezone: process.env.TIMEZONE || "Europe/Moscow",
  logLevel: process.env.CRON_LOG_LEVEL || "info",
};

export default config;
