import fs from "fs";
import path from "path";
import pino, { type DestinationStream, multistream } from "pino";
import pinoPretty from "pino-pretty";
import type { AdminEventData } from "../types/audit.js";
import type { AuditLoggers, UserEventData } from "../types/audit-logger.js";

class AuditLogger {
  logDir: string;
  loggers: AuditLoggers;

  constructor() {
    // Use absolute path in container
    this.logDir = "/app/src/logs";
    console.log("🔧 Initializing logger in:", this.logDir);

    // Check and create directory structure
    this.ensureDirectories();

    // Create simple synchronous loggers
    this.loggers = this.createSimpleLoggers();

    console.log("✅ Logger ready");

    // Test message
    this.loggers.app.info("🔄 Logger initialized");
  }

  ensureDirectories(): void {
    const dirs = [
      "audit/users/current",
      "audit/admins/current",
      "application",
      "errors",
      "access",
    ];

    dirs.forEach((dir) => {
      const fullPath = path.join(this.logDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`📁 Created directory: ${fullPath}`);
      }
    });
  }

  createSimpleLoggers(): AuditLoggers {
    console.log("🛠 Creating loggers...");

    const today = new Date().toISOString().split("T")[0];

    // File paths
    const adminLogPath = path.join(
      this.logDir,
      "audit/admins/current",
      `${today}.log`,
    );
    const userLogPath = path.join(
      this.logDir,
      "audit/users/current",
      `${today}.log`,
    );
    const appLogPath = path.join(this.logDir, "application", `${today}.log`);
    const errorLogPath = path.join(this.logDir, "errors", `${today}.log`);
    const accessLogPath = path.join(this.logDir, "access", `${today}.log`);

    console.log("📄 Log paths:");
    console.log("   Admin:", adminLogPath);
    console.log("   User:", userLogPath);
    console.log("   App:", appLogPath);

    // Create synchronous transport for debugging
    const createSyncTransport = (filePath: string): DestinationStream => {
      return pino.destination({
        dest: filePath,
        sync: true, // IMPORTANT: synchronous writing for debugging
        mkdir: true,
        minLength: 0, // Immediate writing
      });
    };

    const loggers = {
      // Main application logger (console + file)
      app: pino(
        {
          level: "info",
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: {
            level: (label: string): { level: string } => ({
              level: label.toUpperCase(),
            }),
          },
        },
        multistream([
          {
            stream: pinoPretty({
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            }),
            level: "info",
          },
          {
            stream: createSyncTransport(appLogPath),
            level: "info",
          },
        ]),
      ),

      // Error logger
      error: pino(
        {
          level: "error",
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        multistream([
          {
            stream: pinoPretty({
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            }),
            level: "error",
          },
          {
            stream: createSyncTransport(errorLogPath),
            level: "error",
          },
        ]),
      ),

      // Admin audit logger (FILE ONLY)
      adminAudit: pino(
        {
          level: "info",
          timestamp: pino.stdTimeFunctions.isoTime,
          messageKey: "event",
          formatters: {
            level: (label: string): { level: string } => ({
              level: label.toUpperCase(),
            }),
          },
        },
        createSyncTransport(adminLogPath),
      ),

      // User audit logger (FILE ONLY)
      userAudit: pino(
        {
          level: "info",
          timestamp: pino.stdTimeFunctions.isoTime,
          messageKey: "event",
          formatters: {
            level: (label: string): { level: string } => ({
              level: label.toUpperCase(),
            }),
          },
        },
        createSyncTransport(userLogPath),
      ),

      // Access logger
      access: pino(
        {
          level: "info",
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        createSyncTransport(accessLogPath),
      ),
    };

    console.log("✅ Loggers created");
    return loggers;
  }

  /**
   * Admin audit logging
   */
  logAdminEvent(
    adminId: string,
    adminEmail: string,
    adminRole: string,
    event: string,
    action: string,
    targetUser: any = null,
    changes: any[] = [],
    justification: string = "",
  ): void {
    try {
      console.log(`📝 Logging admin event: ${event}`);

      const logData: AdminEventData = {
        event,
        userId: adminId,
        userEmail: this.maskEmail(adminEmail),
        userRole: adminRole,
        action,
        description: "",
      };

      if (targetUser) {
        // logData.t = targetUser.id;
        // logData.targetUserEmail = this.maskEmail(targetUser.email);
      }

      if (changes && changes.length > 0) {
        logData.changes = changes;
      }

      if (justification) {
        // logData.justification = justification;
      }

      // IMPORTANT: Use .info() with object
      this.loggers.adminAudit.info(logData);

      // Force buffer flush
      this.loggers.adminAudit.flush?.();

      console.log(`✅ Admin event written: ${event}`);

      // For debugging, also log to console
      console.log("📊 Log data:", JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error("❌ Error logging admin event:", error);
      this.loggers.app.error({
        message: "Error logging admin event",
        error: (error as Error).message,
        event,
        adminId,
      });
    }
  }

  /**
   * User audit logging
   */
  logUserEvent(
    userId: string,
    email: string,
    event: string,
    action: string,
    metadata: Record<string, any> = {},
  ): void {
    try {
      const maskedEmail = this.maskEmail(email);

      const logData: UserEventData = {
        event,
        userId,
        userEmail: maskedEmail,
        action,
        ...metadata,
        auditType: "USER_ACTION",
        timestamp: new Date().toISOString(),
      };

      this.loggers.userAudit.info(logData);
      this.loggers.userAudit.flush?.();
    } catch (error) {
      console.error("❌ Error logging user event:", error);
      this.loggers.app.error({
        message: "Error logging user event",
        error: (error as Error).message,
        event,
        userId,
      });
    }
  }

  maskEmail(email: string): string {
    if (!email || typeof email !== "string") {
      return "invalid@email";
    }

    try {
      const [local, domain] = email.split("@");
      if (!local || !domain || !domain.includes(".")) {
        return "invalid@email";
      }
      if (local.length <= 2) {
        return `${local[0]}***@${domain}`;
      }
      return `${local[0]}${local[1]}***@${domain}`;
    } catch (error) {
      return "masked@email";
    }
  }
}

// Export singleton
const auditLogger = new AuditLogger();
export default auditLogger;
