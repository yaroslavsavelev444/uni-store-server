import { isProd } from "./env";

const allowedOriginsProd = [
  "https://api.npo-polet.ru",
  "https://npo-polet.ru",
  "https://www.api.npo-polet.ru",
];

const allowedOriginsDev = ["http://localhost:5173", "http://localhost:3000"];

const allowedOrigins = isProd ? allowedOriginsProd : allowedOriginsDev;

export function origin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS blocked: ${origin}`));
}
export const credentials = true;
export const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export const exposedHeaders = ["Refresh-Token"];
export const allowedHeaders = [
  "Content-Type",
  "Authorization",
  "Refresh-Token",
  "X-Device-Platform",
  "X-Device-ID",
  "X-App-Version",
  "X-User-Agent",
  "X-Timestamp",
];
