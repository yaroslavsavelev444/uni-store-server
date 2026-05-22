/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */
import dotenv from "dotenv";
import mongoose, { type Connection } from "mongoose";
import logger from "../logger/logger.js";
import type {
  CollectionInfo,
  MongoConnectionOptions,
  MongoError,
} from "../types/mongo.js";

dotenv.config();

// MongoDB connection options
const connectionOptions: MongoConnectionOptions = {
  serverSelectionTimeoutMS: 45000, // было 30000
  socketTimeoutMS: 90000, // было 45000 — очень важно!
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000, // добавь
  retryWrites: true,
  w: "majority", // для replicaSet
};
// Connection URI from environment or default
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/polet?replicaSet=rs0";

/**
 * Connect to MongoDB database
 */
const connectDB = async (): Promise<void> => {
  logger.info("⏳ Подключение к MongoDB через Mongoose...");

  try {
    await mongoose.connect(MONGODB_URI, connectionOptions);

    logger.info("✅ Подключено к MongoDB через Mongoose");

    // Get list of collections and log them
    if (mongoose.connection.db) {
      const collections = (await mongoose.connection.db
        .listCollections()
        .toArray()) as CollectionInfo[];

      logger.info("📂 Коллекции в базе данных:");
      collections.forEach((collection) => logger.info(`- ${collection.name}`));
    }
  } catch (err) {
    const error = err as MongoError;
    logger.error({
      message: "❌ Ошибка подключения к MongoDB через Mongoose",
      error: error.message,
    });
    throw error;
  }
};

/**
 * Get database instance
 */
const getDB = (): Connection => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "❌ База данных не инициализирована. Вызовите connectDB() сначала.",
    );
  }
  return mongoose.connection;
};

/**
 * Disconnect from MongoDB
 */
const disconnect = async (): Promise<void> => {
  await mongoose.disconnect();
  console.warn("✅ Отключено от MongoDB");
};

mongoose.connection.on("connected", () => {
  console.warn("🟢 MongoDB connected");
});

mongoose.connection.on("disconnected", () => {
  console.warn("🔴 MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.warn("❌ MongoDB connection error", { error: err.message });
});

mongoose.connection.on("reconnected", () => {
  console.warn("🔄 MongoDB reconnected");
});

export { connectDB, disconnect, getDB };
