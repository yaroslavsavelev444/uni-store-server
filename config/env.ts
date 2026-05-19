import dotenv from "dotenv";

dotenv.config();

export type NodeEnv = "development" | "staging" | "production";

export const NODE_ENV: NodeEnv =
  (process.env.NODE_ENV as NodeEnv) || "development";
export const isProd = NODE_ENV === "production";
export const PORT = Number(process.env.PORT) || 3010; // ✅ теперь точно number
export const HOST = "0.0.0.0";
