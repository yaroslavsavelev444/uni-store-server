const express = require("express");
const authMiddleware = require("../middlewares/auth-middleware");
const accountDeletionController = require("../controllers/accountDeletionController");
const router = express.Router();

// Ваши старые роуты
router.post("/", authMiddleware(["all"]), accountDeletionController.create);
router.delete("/", authMiddleware(["all"]), accountDeletionController.cancel);
router.get(
  "/my-request",
  authMiddleware(["all"]),
  accountDeletionController.getMyRequest,
); // новый
router.get(
  "/admin",
  authMiddleware(["admin"]),
  accountDeletionController.getAll,
);

// === 2FA ===
router.post(
  "/2fa/verify",
  authMiddleware(["all"]),
  accountDeletionController.verifyDeletion2FA,
);
router.post(
  "/2fa/resend",
  authMiddleware(["all"]),
  accountDeletionController.resendDeletion2FA,
);
router.post(
  "/2fa/cancel",
  authMiddleware(["all"]),
  accountDeletionController.cancelDeletion2FA,
);

module.exports = router;
