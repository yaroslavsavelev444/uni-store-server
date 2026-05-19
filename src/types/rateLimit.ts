// types/rateLimit.ts (новый файл)
import type { Request } from "express";

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
}

export interface RedisRateLimiterOptions {
  keyPrefix: string;
  windowSec?: number;
  getMax?: (req: Request) => number;
  getKey?: (req: Request) => string; // Добавлено поле getKey
  message?: string; // Добавлено поле message
}

export interface RateLimitResponse {
  error: string;
  retryAfter?: number;
}

export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  [key: string]: any;
}

export interface RequestWithBody extends Request {
  body: {
    email?: string;
    userId?: string;
    [key: string]: any;
  };
}
