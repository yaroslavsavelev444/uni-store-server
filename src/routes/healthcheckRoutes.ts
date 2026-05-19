// src/routes/healthcheckRoutes.ts
import { type Request, type Response, Router } from "express";
import { connection } from "mongoose";
import redis from "../redis/redis.client.js";

interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  app: boolean;
  database: boolean;
  redis: boolean;
  error?: string;
  timestamp: string;
}

const router = Router();

router.get(
  "/healthcheck",
  async (_req: Request, res: Response): Promise<void> => {
    const checks = {
      app: true,
      database: false,
      redis: false,
    };

    try {
      // Проверка MongoDB через native driver
      await connection.db?.admin().ping();
      checks.database = true;

      // Проверка Redis
      const pong = await redis.ping();
      checks.redis = pong === "PONG";

      const status: HealthCheckResponse["status"] =
        checks.database && checks.redis ? "ok" : "degraded";

      const response: HealthCheckResponse = {
        status,
        ...checks,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      const err = error as Error;
      const response: HealthCheckResponse = {
        status: "down",
        error: err.message,
        ...checks,
        timestamp: new Date().toISOString(),
      };
      res.status(503).json(response);
    }
  },
);

export default router;
