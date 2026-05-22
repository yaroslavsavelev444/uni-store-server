const fs = require('fs');
const path = require('path');
const pino = require('pino');

const logDir = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const errorLogPath = path.join(logDir, 'error.log');

// Создаём транспорт для красивого вывода в консоль
const prettyTransport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
  },
});

// Создаём транспорт для записи ошибок в файл
const fileTransport = pino.transport({
  target: 'pino/file',
  options: {
    destination: errorLogPath,
    mkdir: true,
    append: true,
    level: 'error',
  },
});

const logger = pino(
  {
    level: 'info',
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    { stream: prettyTransport, level: 'info' },
    { stream: fileTransport, level: 'error' },
  ])
);


module.exports = logger;