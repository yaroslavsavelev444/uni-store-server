import type { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Middleware to add context to the request
 */
const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Generate unique request ID if not present
  if (!req.id) {
    req.id = `req_${uuidv4()}`;
  }

  // Add start time for performance tracking
  req._startTime = process.hrtime();

  // Add safe headers to context
  req.context = {
    requestId: req.id,
    ip:
      req.ip ||
      (req.headers["x-forwarded-for"] as string) ||
      req.socket.remoteAddress ||
      "unknown",
    userAgent: req.headers["user-agent"],
    timestamp: new Date().toISOString(),
    correlationId: (req.headers["x-correlation-id"] as string) || req.id,
  };

  // Set correlation ID in response headers
  res.setHeader("X-Request-ID", req.id);
  res.setHeader("X-Correlation-ID", req.context.correlationId);

  next();
};

export default requestContextMiddleware;
