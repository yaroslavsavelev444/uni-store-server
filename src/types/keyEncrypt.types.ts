import type { Document, Model } from "mongoose";

export interface IKeyEncrypt {
  version: number; // уникальная версия ключа
  dekEncrypted: string; // base64 (iv + ciphertext + authTag) — зашифрованный DEK
  active: boolean;
  comment?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IKeyEncryptVirtuals = {};

export type IKeyEncryptMethods = {};

export interface KeyEncryptModelType extends Model<
  IKeyEncryptDocument,
  {},
  IKeyEncryptMethods
> {
  // статические методы (если понадобятся)
}

export type IKeyEncryptDocument = Document<unknown, {}, IKeyEncrypt> &
  IKeyEncrypt &
  IKeyEncryptVirtuals &
  IKeyEncryptMethods;
