import {
  format as _format,
  transports as _transports,
  createLogger,
} from "winston";

const logger = createLogger({
  level: "info",
  format: _format.json(),
  transports: [
    new _transports.Console(),
    new _transports.File({ filename: "error.log", level: "error" }),
    new _transports.File({ filename: "combined.log" }),
  ],
});

export default logger;
