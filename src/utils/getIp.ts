// utils/getIp.ts
import type { Request } from "express";

/**
 * Получение реального IP-адреса клиента из запроса
 */
const getIp = (req: Request): string => {
  if (!req) {
    console.error("getIp called with undefined req");
    return "unknown";
  }

  // Приоритет: x-forwarded-for (если за прокси), затем socket.remoteAddress
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.trim()
        : undefined;

  return ip || req.socket?.remoteAddress || "unknown";
};

export default getIp;
