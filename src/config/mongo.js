const mongoose = require("mongoose");
const logger = require("../logger/logger");
require("dotenv").config();

// Подключение к базе данных
const connectDB = async () => {
  console.log("⏳ Подключение к MongoDB через Mongoose...");
  try {
    await mongoose.connect(
      "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/polet?replicaSet=rs0",
      {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      }
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

// Получение экземпляра базы данных через Mongoose
const getDB = () => {
  if (!mongoose.connection.readyState) {
    throw new Error(
      "❌ База данных не инициализирована. Вызовите connectDB() сначала."
    );
  }
  return mongoose.connection;
};

const disconnect = async () => {
  await mongoose.disconnect();
  logger.info("✅ Отключено от MongoDB");
};

module.exports = { connectDB, getDB, disconnect };
