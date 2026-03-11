import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pino, { multistream, stdTimeFunctions, transport } from "pino";

const logDir = join(__dirname, "..", "logs");

if (!existsSync(logDir)) {
  mkdirSync(logDir);
}

const errorLogPath = join(logDir, "error.log");

// Создаём транспорт для красивого вывода в консоль
const prettyTransport = transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "HH:MM:ss",
    ignore: "pid,hostname",
  },
});

// Создаём транспорт для записи ошибок в файл
const fileTransport = transport({
  target: "pino/file",
  options: {
    destination: errorLogPath,
    mkdir: true,
    append: true,
    level: "error",
  },
});

const logger = pino(
  {
    level: "info",
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: stdTimeFunctions.isoTime,
  },
  multistream([
    { stream: prettyTransport, level: "info" },
    { stream: fileTransport, level: "error" },
  ]),
);

export default logger;
