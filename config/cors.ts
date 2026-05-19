import type { CorsOptions } from "cors";
import { isProd } from "./env.js";

const allowedOriginsProd: string[] = [
  "https://api.npo-polet.ru",
  "https://npo-polet.ru",
  "https://www.api.npo-polet.ru",
];

const allowedOriginsDev: string[] = [
  "http://localhost:5173",
  "http://localhost:3000",
];

const allowedOrigins: string[] = isProd
  ? allowedOriginsProd
  : allowedOriginsDev;

export const origin: CorsOptions["origin"] = (
  origin: string | undefined,
  callback: (err: Error | null, allow: boolean) => void,
) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked: ${origin}`), false);
};
export const credentials: CorsOptions["credentials"] = true;
export const methods: CorsOptions["methods"] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];
export const exposedHeaders: CorsOptions["exposedHeaders"] = ["Refresh-Token"];
export const allowedHeaders: CorsOptions["allowedHeaders"] = [
  "Content-Type",
  "Authorization",
  "Refresh-Token",
  "X-Device-Platform",
  "X-Device-ID",
  "X-App-Version",
  "X-User-Agent",
  "X-Timestamp",
];

const config: CorsOptions = {
  origin,
  credentials,
  methods,
  exposedHeaders,
  allowedHeaders,
};

export default config;
