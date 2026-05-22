const { isProd } = require("./env");

const allowedOriginsProd = [
  "https://api.npo-polet.ru",
  "https://npo-polet.ru",
  "https://www.api.npo-polet.ru",
];

const allowedOriginsDev = [
  "http://localhost:5173",
  "http://localhost:3000",
];

const allowedOrigins = isProd
  ? allowedOriginsProd
  : allowedOriginsDev;

module.exports = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposedHeaders: ["Refresh-Token"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Refresh-Token",
    "X-Device-Platform",
    "X-Device-ID",
    "X-App-Version",
    "X-User-Agent",
    "X-Timestamp",
  ],
};