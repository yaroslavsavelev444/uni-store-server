import type { CompressedFile } from "../../middlewares/imageCompressor.js";
import type { AuditMetadata } from "../audit.js";

export * from "../audit.js";
export * from "./middleware.js";

declare global {
  namespace Express {
    interface Request {
      id?: string;
      _startTime?: [number, number];
      context?: {
        requestId: string;
        ip: string;
        userAgent?: string;
        timestamp: string;
        correlationId: string;
      };

      _auditMetadata?: AuditMetadata;
      user?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
      uploadedFiles?: CompressedFile[];
    }

    interface Response {
      _auditMetadata?: AuditMetadata;
    }
  }
}
