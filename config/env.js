import dotenv from "dotenv";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const PORT = process.env.PORT || 3010;
const HOST = "0.0.0.0";

export { HOST, isProd, NODE_ENV, PORT };
