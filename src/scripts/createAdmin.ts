#!/usr/bin/env node

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import type { Types } from "mongoose";
import { UserModel, UserSecurityModel } from "../models/index.models.js";
import type { IUser } from "../types/user.types.js";

// Загрузка переменных окружения
dotenv.config();

// ========== Константы ==========
const DEFAULT_SALT_ROUNDS = 10;
const SALT_ROUNDS: number = (() => {
  const parsed = parseInt(process.env.SALT_ROUNDS ?? "", 10);
  return Number.isNaN(parsed) ? DEFAULT_SALT_ROUNDS : parsed;
})();

// ========== Функции ==========

/**
 * Подключение к MongoDB через существующую конфигурацию.
 * Предполагается, что в ../config/mongo.js есть функции connectDB и disconnect.
 * Вместо прямого вызова используем импорт (если есть), либо вызов стандартного mongoose.connect.
 * Здесь я предполагаю, что файл ../config/mongo.js экспортирует объект с методами.
 * Если нет — можно напрямую использовать mongoose.connect(process.env.MONGODB_URI).
 */
import { connectDB, disconnect } from "../config/mongo.js";

/**
 * Утилита для безопасного выхода с ошибкой
 */
function exitWithError(error: unknown, message: string): never {
  console.error(message, error);
  process.exit(1);
}

/**
 * Создаёт или обновляет пользователя-администратора.
 * @returns Документ администратора
 */
async function createOrUpdateAdmin(): Promise<
  import("mongoose").HydratedDocument<IUser>
> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordPlain = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail || !adminPasswordPlain) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in environment variables",
    );
  }

  const normalizedEmail = adminEmail.toLowerCase().trim();
  const hashedPassword = await bcrypt.hash(adminPasswordPlain, SALT_ROUNDS);

  let admin = await UserModel.findOne({ email: normalizedEmail });

  if (admin) {
    // Обновление существующего: меняем роль на admin и пароль
    admin.role = "admin";
    admin.password = hashedPassword;
    await admin.save();
    console.log(`Admin updated: ${admin._id.toString()}`);
  } else {
    admin = new UserModel({
      name: "Admin",
      email: normalizedEmail,
      password: hashedPassword,
      role: "admin",
      // поля activations, tokens, status и т.д. будут использованы по умолчанию
    });
    await admin.save();
    console.log(`Admin created: ${admin._id.toString()}`);
  }

  return admin;
}

/**
 * Создаёт запись UserSecurity для администратора, если её нет.
 * @param userId - ObjectId администратора
 */
async function ensureUserSecurity(userId: Types.ObjectId): Promise<void> {
  const existingSec = await UserSecurityModel.findOne({ userId });
  if (!existingSec) {
    const newSec = new UserSecurityModel({
      userId,
      twoFAAttempts: 0,
      resetTokenStatus: "pending",
    });
    await newSec.save();
    console.log(`UserSecurity created for admin: ${userId.toString()}`);
  } else {
    console.log(`UserSecurity already exists for admin: ${userId.toString()}`);
  }
}

/**
 * Основная функция инициализации администратора.
 */
async function initAdmin(): Promise<void> {
  try {
    // Подключение к БД
    await connectDB();

    const admin = await createOrUpdateAdmin();
    await ensureUserSecurity(admin._id as Types.ObjectId);

    await disconnect();
    console.log("Admin setup completed successfully.");
  } catch (error) {
    await disconnect().catch(() => {});
    exitWithError(error, "Admin setup failed:");
  }
}

// Запуск скрипта
initAdmin().catch((err) => {
  console.error("Unhandled promise rejection:", err);
  process.exit(1);
});
