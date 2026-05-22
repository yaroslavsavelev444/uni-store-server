require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

module.exports = {
  NODE_ENV,
  isProd,
  PORT: process.env.PORT || 3010,
  HOST: "0.0.0.0",
};