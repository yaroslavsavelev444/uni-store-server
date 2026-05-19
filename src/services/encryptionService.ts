import crypto from "node:crypto";
import dotenv from "dotenv";
import { KeyEncryptModel } from "../models/index.models.js";
import type {
  ActiveKeyResult,
  EncryptedString,
  IKeyEncrypt,
  RotateKeyOptions,
} from "../types/encryption.js";

dotenv.config({ path: "../../.env" });

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const DEK_LEN = 32;
const AUTH_TAG_LEN = 16;

/**
 * Get KEK (Key Encryption Key) from environment
 */
function getKekFromEnv(): Buffer {
  if (!process.env.KEY_ENCRYPTION_KEY) {
    throw new Error("KEY_ENCRYPTION_KEY env var required (base64).");
  }
  return Buffer.from(process.env.KEY_ENCRYPTION_KEY, "base64");
}

/**
 * Wrap DEK (Data Encryption Key) with KEK
 */
export function wrapDEK(kekBuf: Buffer, dekBuf: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, kekBuf, iv, {
    authTagLength: AUTH_TAG_LEN,
  });
  const ct = Buffer.concat([cipher.update(dekBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Unwrap DEK (Data Encryption Key) using KEK
 */
export function unwrapDEK(kekBuf: Buffer, wrappedBase64: string): Buffer {
  const data = Buffer.from(wrappedBase64, "base64");
  const iv = data.slice(0, IV_LEN);
  const tag = data.slice(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ct = data.slice(IV_LEN + AUTH_TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGO, kekBuf, iv, {
    authTagLength: AUTH_TAG_LEN,
  });
  decipher.setAuthTag(tag);
  const dek = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dek;
}

/**
 * Generate a new DEK
 */
export function generateDEK(): Buffer {
  return crypto.randomBytes(DEK_LEN);
}

/**
 * Encrypt plaintext with DEK
 */
export function encryptWithDEK(
  dekBuf: Buffer,
  plaintext: string,
  aad: Buffer | string | null = null,
): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, dekBuf, iv, {
    authTagLength: AUTH_TAG_LEN,
  });

  if (aad) {
    cipher.setAAD(Buffer.from(aad));
  }

  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt payload with DEK
 */
export function decryptWithDEK(
  dekBuf: Buffer,
  payloadBase64: string,
  aad: Buffer | string | null = null,
): string {
  const data = Buffer.from(payloadBase64, "base64");
  const iv = data.slice(0, IV_LEN);
  const tag = data.slice(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ct = data.slice(IV_LEN + AUTH_TAG_LEN);

  const decipher = crypto.createDecipheriv(ALGO, dekBuf, iv, {
    authTagLength: AUTH_TAG_LEN,
  });

  if (aad) {
    decipher.setAAD(Buffer.from(aad));
  }

  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Get active DEK from database
 */
export async function getActiveDEK(): Promise<ActiveKeyResult> {
  const keyDoc = (await KeyEncryptModel.findOne({ active: true })
    .sort({ version: -1 })
    .lean()) as IKeyEncrypt | null;

  if (!keyDoc) {
    throw new Error("No active data key. Generate one using rotateDataKey()");
  }

  const kek = getKekFromEnv();
  const dek = unwrapDEK(kek, keyDoc.dekEncrypted);
  return { dek, version: keyDoc.version };
}

/**
 * Encrypt data for storage
 */
export async function encryptForStorage(
  plaintext: string,
): Promise<EncryptedString> {
  if (!plaintext) return plaintext;

  const { dek, version } = await getActiveDEK();
  const blob = encryptWithDEK(dek, plaintext);
  return `ENC|v${version}|${blob}`;
}

/**
 * Decrypt data from storage
 */
export async function decryptFromStorage(stored: string): Promise<string> {
  if (!stored) return stored;
  if (typeof stored !== "string") return stored;

  const ENC_PREFIX = /^ENC\|v(\d+)\|(.+)$/;
  const match = stored.match(ENC_PREFIX);

  if (!match) return stored;

  const version = parseInt(match[1], 10);
  const payload = match[2];

  const keyDoc = (await KeyEncryptModel.findOne({
    version,
  }).lean()) as IKeyEncrypt | null;
  if (!keyDoc) {
    throw new Error(`Missing data key for version ${version}`);
  }

  const kek = getKekFromEnv();
  const dek = unwrapDEK(kek, keyDoc.dekEncrypted);
  return decryptWithDEK(dek, payload);
}

/**
 * Rotate data key (create new active key)
 */
export async function rotateDataKey(
  options: RotateKeyOptions = {},
): Promise<IKeyEncrypt> {
  const kek = getKekFromEnv();
  const dek = generateDEK();
  const wrapped = wrapDEK(kek, dek);

  const last = (await KeyEncryptModel.findOne({})
    .sort({ version: -1 })
    .lean()) as IKeyEncrypt | null;
  const nextVersion = last ? last.version + 1 : 1;

  // Deactivate all current keys
  await KeyEncryptModel.updateMany(
    { active: true },
    { $set: { active: false } },
  );

  // Create new active key
  const created = await KeyEncryptModel.create({
    version: nextVersion,
    dekEncrypted: wrapped,
    active: true,
    comment: options.comment || `rotated at ${new Date().toISOString()}`,
  });

  return created;
}

/**
 * List all keys
 */
export async function listKeys(): Promise<IKeyEncrypt[]> {
  return KeyEncryptModel.find({}).sort({ version: -1 }).lean() as Promise<
    IKeyEncrypt[]
  >;
}
