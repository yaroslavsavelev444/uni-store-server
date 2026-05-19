import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir: string = path.join(__dirname, "..", "..", "logs");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const errorLogPath: string = path.join(logDir, "error.log");

const prettyTransport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss",
    ignore: "pid,hostname",
  },
});

const fileTransport = pino.transport({
  target: "pino/file",
  options: {
    destination: errorLogPath,
    mkdir: true,
    append: true,
  },
});

const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label: string) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  pino.multistream([
    { stream: prettyTransport, level: "debug" },
    { stream: fileTransport, level: "error" },
  ]),
);

// Обёртка с поддержкой двух форматов вызова
export const logger = {
  error: (msgOrObj: string | Record<string, unknown>, error?: unknown) => {
    if (typeof msgOrObj === "string") {
      const message = msgOrObj;
      if (error instanceof Error) {
        pinoLogger.error({ err: error, message });
      } else if (error !== undefined) {
        pinoLogger.error({ message, error });
      } else {
        pinoLogger.error(message);
      }
    } else {
      const obj = msgOrObj;
      if (obj.error instanceof Error) {
        pinoLogger.error({ ...obj, err: obj.error });
      } else {
        pinoLogger.error(obj);
      }
    }
  },
  info: (msgOrObj: string | Record<string, unknown>, p0?: string) => {
    if (typeof msgOrObj === "string") {
      pinoLogger.info(msgOrObj);
    } else {
      pinoLogger.info(msgOrObj);
    }
  },
  warn: (msgOrObj: string | Record<string, unknown>, p0: string) => {
    if (typeof msgOrObj === "string") {
      pinoLogger.warn(msgOrObj);
    } else {
      pinoLogger.warn(msgOrObj);
    }
  },
  debug: (msgOrObj: string | Record<string, unknown>) => {
    if (typeof msgOrObj === "string") {
      pinoLogger.debug(msgOrObj);
    } else {
      pinoLogger.debug(msgOrObj);
    }
  },
  fatal: (msgOrObj: string | Record<string, unknown>) => {
    if (typeof msgOrObj === "string") {
      pinoLogger.fatal(msgOrObj);
    } else {
      pinoLogger.fatal(msgOrObj);
    }
  },
  trace: (msgOrObj: string | Record<string, unknown>) => {
    if (typeof msgOrObj === "string") {
      pinoLogger.trace(msgOrObj);
    } else {
      pinoLogger.trace(msgOrObj);
    }
  },
  child: (bindings: pino.Bindings) => {
    const childLogger = pinoLogger.child(bindings);
    return {
      error: (msgOrObj: string | Record<string, unknown>, error?: unknown) => {
        if (typeof msgOrObj === "string") {
          const message = msgOrObj;
          if (error instanceof Error) {
            childLogger.error({ err: error, message });
          } else if (error !== undefined) {
            childLogger.error({ message, error });
          } else {
            childLogger.error(message);
          }
        } else {
          const obj = msgOrObj;
          if (obj.error instanceof Error) {
            childLogger.error({ ...obj, err: obj.error });
          } else {
            childLogger.error(obj);
          }
        }
      },
      info: (msgOrObj: string | Record<string, unknown>) => {
        if (typeof msgOrObj === "string") childLogger.info(msgOrObj);
        else childLogger.info(msgOrObj);
      },
      warn: (msgOrObj: string | Record<string, unknown>) => {
        if (typeof msgOrObj === "string") childLogger.warn(msgOrObj);
        else childLogger.warn(msgOrObj);
      },
      debug: (msgOrObj: string | Record<string, unknown>) => {
        if (typeof msgOrObj === "string") childLogger.debug(msgOrObj);
        else childLogger.debug(msgOrObj);
      },
      fatal: (msgOrObj: string | Record<string, unknown>) => {
        if (typeof msgOrObj === "string") childLogger.fatal(msgOrObj);
        else childLogger.fatal(msgOrObj);
      },
      trace: (msgOrObj: string | Record<string, unknown>) => {
        if (typeof msgOrObj === "string") childLogger.trace(msgOrObj);
        else childLogger.trace(msgOrObj);
      },
      child: (b: pino.Bindings) => logger.child(b),
    };
  },
};

export default logger;
