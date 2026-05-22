import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Генерирует 6-значный 2FA код
 * @returns {string} 6-значный цифровой код
 */
export function generate2FACode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Хэширует код с помощью SHA-256 и возвращает Buffer для безопасного сравнения
 * @param {string} code - код для хэширования
 * @returns {Buffer} Buffer с хэшем
 */
export function hashCode(code: string): Buffer {
  return createHash("sha256").update(code).digest();
}

/**
 * Безопасно сравнивает введённый код с сохранённым хэшем
 * @param {string} inputCode - введённый пользователем код
 * @param {Buffer} storedHash - хэш, сохранённый в БД (Buffer)
 * @returns {boolean} true, если коды совпадают
 */
export function isCodeMatch(inputCode: string, storedHash: Buffer): boolean {
  const inputHash = hashCode(inputCode);
  // timingSafeEqual требует одинаковую длину буферов
  if (inputHash.length !== storedHash.length) {
    return false;
  }
  return timingSafeEqual(inputHash, storedHash);
}

// Для обратной совместимости с default импортом
export default {
  generate2FACode,
  hashCode,
  isCodeMatch,
};
