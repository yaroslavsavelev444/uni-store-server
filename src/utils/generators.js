import { createHash, timingSafeEqual } from "node:crypto";

function generate2FACode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code) {
  return createHash("sha256").update(code).digest("hex");
}
function isCodeMatch(inputCode, storedHash) {
  const inputHash = hashCode(inputCode);
  return timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
}

export default {
  generate2FACode,
  hashCode,
  isCodeMatch,
};
