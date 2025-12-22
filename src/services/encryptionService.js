// services/encryptionService.js
const crypto = require("crypto");
const logger = require("../logger/logger");
const { KeyEncryptModel } = require("../models/index.models");
require("dotenv").config({ path: "../../.env" });

const KEK = process.env.KEY_ENCRYPTION_KEY; // must be 32 bytes base64 or hex; see below
if (!KEK) {
  // Не падаем при импорте — бросаем только при первой операции
  logger.warn("KEY_ENCRYPTION_KEY not set — encryption operations will fail until it is set.");
}

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // recommended for GCM
const DEK_LEN = 32; // 256 bits

function bufFromEnvKey() {
  if (!process.env.KEY_ENCRYPTION_KEY) {
    throw new Error("KEY_ENCRYPTION_KEY env var required (base64).");
  }
  // ожидаем base64
  return Buffer.from(process.env.KEY_ENCRYPTION_KEY, "base64");
}

/**
 * Wrap (encrypt) a raw DEK using KEK (AES-256-GCM).
 * Returns base64 of iv + ciphertext + authTag
 */
function wrapDEK(kekBuf, dekBuf) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, kekBuf, iv, { authTagLength: 16 });
  const ct = Buffer.concat([cipher.update(dekBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Unwrap (decrypt) wrapped DEK with KEK.
 * Input is base64(iv + authTag + ct)
 */
function unwrapDEK(kekBuf, wrappedBase64) {
  const data = Buffer.from(wrappedBase64, "base64");
  const iv = data.slice(0, IV_LEN);
  const tag = data.slice(IV_LEN, IV_LEN + 16);
  const ct = data.slice(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, kekBuf, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const dek = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dek; // Buffer
}

/**
 * Generate new DEK (random 32 bytes), return Buffer.
 */
function generateDEK() {
  return crypto.randomBytes(DEK_LEN);
}

/**
 * Encrypt plaintext using DEK (AES-256-GCM).
 * Returns base64 of iv + tag + ciphertext
 */
function encryptWithDEK(dekBuf, plaintext, aad = null) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, dekBuf, iv, { authTagLength: 16 });
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt ciphertext blob produced above using DEK.
 */
function decryptWithDEK(dekBuf, payloadBase64, aad = null) {
  const data = Buffer.from(payloadBase64, "base64");
  const iv = data.slice(0, IV_LEN);
  const tag = data.slice(IV_LEN, IV_LEN + 16);
  const ct = data.slice(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, dekBuf, iv, { authTagLength: 16 });
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Get active DEK (unwrapped). Throws if no active key or KEK missing.
 */
async function getActiveDEK() {
  const keyDoc = await KeyEncryptModel.findOne({ active: true }).sort({ version: -1 }).lean();
  if (!keyDoc) {
    throw new Error("No active data key. Generate one using rotateDataKey()");
  }
  const kek = bufFromEnvKey();
  const dek = unwrapDEK(kek, keyDoc.dekEncrypted);
  return { dek, version: keyDoc.version };
}

/**
 * Encrypt plain text for storage. Returns string: ENC|v{ver}|<base64>
 */
async function encryptForStorage(plaintext) {
  if (!plaintext) return plaintext;
  const { dek, version } = await getActiveDEK();
  const blob = encryptWithDEK(dek, plaintext);
  return `ENC|v${version}|${blob}`;
}

/**
 * Decrypt stored value if encrypted else return raw.
 */
async function decryptFromStorage(stored) {
  if (!stored) return stored;
  if (typeof stored !== "string") return stored;
  const ENC_PREFIX = /^ENC\|v(\d+)\|(.+)$/;
  const m = stored.match(ENC_PREFIX);
  if (!m) {
    // not encrypted (legacy plaintext)
    return stored;
  }
  const ver = parseInt(m[1], 10);
  const payload = m[2];
  // find key by version
  const keyDoc = await KeyEncryptModel.findOne({ version: ver }).lean();
  if (!keyDoc) {
    throw new Error(`Missing data key for version ${ver}`);
  }
  const kek = bufFromEnvKey();
  const dek = unwrapDEK(kek, keyDoc.dekEncrypted);
  return decryptWithDEK(dek, payload);
}

/**
 * Rotate data key — create new DEK, wrap with KEK, set active
 * Returns created keyDoc
 */
async function rotateDataKey({ comment } = {}) {
  const kek = bufFromEnvKey();
  const dek = generateDEK();
  const wrapped = wrapDEK(kek, dek);
  // next version
  const last = await KeyEncryptModel.findOne({}).sort({ version: -1 }).lean();
  const nextVersion = last ? last.version + 1 : 1;
  // mark previous active -> false
  await KeyEncryptModel.updateMany({ active: true }, { $set: { active: false } });
  const created = await KeyEncryptModel.create({
    version: nextVersion,
    dekEncrypted: wrapped,
    active: true,
    comment: comment || `rotated at ${new Date().toISOString()}`,
  });
  return created;
}

/**
 * Helper: list keys (versions)
 */
async function listKeys() {
  return KeyEncryptModel.find({}).sort({ version: -1 }).lean();
}

module.exports = {
  encryptForStorage,
  decryptFromStorage,
  rotateDataKey,
  listKeys,
  generateDEK,
  wrapDEK,
  unwrapDEK,
};