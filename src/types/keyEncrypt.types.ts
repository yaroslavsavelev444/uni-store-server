import type { HydratedDocument, Model } from "mongoose";

// === Базовые поля, сохраняемые в БД ===
export interface IKeyEncrypt {
  version: number; // уникальная версия ключа
  dekEncrypted: string; // base64 (iv + ciphertext + authTag) — зашифрованный DEK
  active: boolean;
  comment?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// === Методы экземпляра (если появятся) ===
export type IKeyEncryptMethods = {};

// === Статические методы модели ===
export interface IKeyEncryptModel extends Model<
  IKeyEncrypt,
  {},
  IKeyEncryptMethods
> {
  // при необходимости добавить статические методы
}

// === Тип документа с методами ===
export type KeyEncryptDocument = HydratedDocument<
  IKeyEncrypt,
  IKeyEncryptMethods
>;
