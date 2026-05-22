
const crypto = require("crypto");

function generate2FACode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}
function isCodeMatch(inputCode, storedHash) {
  const inputHash = hashCode(inputCode);
  return crypto.timingSafeEqual(
    Buffer.from(inputHash),
    Buffer.from(storedHash)
  );
};

module.exports = {
  generate2FACode,
  hashCode,
  isCodeMatch,
};