// config/env.ts
import dotenv from "dotenv";

dotenv.config();

export type NodeEnv = "development" | "staging" | "production";

export const NODE_ENV: NodeEnv =
  (process.env.NODE_ENV as NodeEnv) || "development";
export const isProd = NODE_ENV === "production";
export const PORT = process.env.PORT || 3010;
export const HOST = "0.0.0.0";
