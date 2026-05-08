import dotenv from "dotenv";
import { disconnect as _disconnect, connect, connection } from "mongoose";
import { error, info } from "../logger/logger.js";

dotenv.config();

// Подключение к базе данных
const connectDB = async () => {
  console.log("⏳ Подключение к MongoDB через Mongoose...");
  try {
    await mongoose.connect(
      "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/polet?replicaSet=rs0",
      {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      },
    );

    logger.info("✅ Подключено к MongoDB через Mongoose");

    // Получение списка коллекций и вывод в консоль
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    logger.info("📂 Коллекции в базе данных:");
    collections.forEach((collection) => logger.info(`- ${collection.name}`));
  } catch (err) {
    logger.error("❌ Ошибка подключения к MongoDB:", err);
    throw err;
  }
};

mongoose.connection.on("connected", () => {
  console.log("🟢 MONGO CONNECTED " + new Date().toISOString());
});

mongoose.connection.on("disconnected", () => {
  console.log("🔴 MONGO DISCONNECTED " + new Date().toISOString());
});

mongoose.connection.on("error", (err) => {
  console.log("❌ MONGO ERROR", err);
});

// Получение экземпляра базы данных через Mongoose
const getDB = () => {
  if (!mongoose.connection.readyState) {
    throw new Error(
      "❌ База данных не инициализирована. Вызовите connectDB() сначала.",
    );
  }
  return mongoose.connection;
};

const disconnect = async () => {
  await mongoose.disconnect();
  logger.info("✅ Отключено от MongoDB");
};

export { connectDB, disconnect, getDB };
