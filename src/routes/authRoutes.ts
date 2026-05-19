//@ts-nocheck
// routes/auth.js
/** biome-ignore-all lint/style/noCommonJs: <explanation> */
import { Router } from "express";

const router = Router();

import authController from "../controllers/authController.js";
import {
  completePasswordResetLimiter,
  initiatePasswordResetLimiter,
  ipLimiter,
  passwordResetProcessLimiter,
  resendPasswordResetCodeLimiter,
  verifyPasswordResetCodeLimiter,
} from "../limiters/passwordResetLimiters.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import { createAuthMiddleware } from "../middlewares/deviceAuthMiddleware.js";
import { createRedisRateLimiter } from "../middlewares/rateLimit.js";

// Динамический лимит по роли пользователя для логина
const emailLimiter = createRedisRateLimiter({
  keyPrefix: "login:email",
  windowSec: 60,
  getMax: (req) => {
    if (req.body.role === "admin") return 10;
    return 5;
  },
});

// BASE AUTH
router.post(
  "/register",
  createAuthMiddleware(),
  authController.register as any,
);
router.post("/login", ipLimiter, emailLimiter, authController.login);
router.post("/logout", authMiddleware.requireAuth, authController.logout);
router.get(
  "/refresh",
  authMiddleware.refreshMiddleware(),
  authController.refresh,
);
router.post("/check", authController.check);

// UPDATES
router.post(
  "/updateUser",
  authMiddleware.requireAuth,
  authController.updateUser,
);

// 2FA CODES
const faLimiter = createRedisRateLimiter({
  keyPrefix: "verify:fa:email",
  windowSec: 60,
  getMax: () => 5,
});

router.post(
  "/verify2faCode",
  ipLimiter,
  faLimiter,
  authController.verify2faCode,
);

// RESEND CODES
const resend2FaLimiter = createRedisRateLimiter({
  keyPrefix: "verify:fa:resend:email",
  windowSec: 60,
  getMax: () => 3,
});

router.post(
  "/resend2faCode",
  ipLimiter,
  resend2FaLimiter,
  authController.resendFaCode,
);

// SESSIONS
router.get("/sessions", authMiddleware.requireAuth, authController.getSessions);
router.patch(
  "/revokeSession",
  authMiddleware.requireAuth,
  authController.revokeSession,
);

router.post(
  "/changePassword",
  authMiddleware.requireAuth,
  authController.changePassword,
);

router.post(
  "/initiatePasswordReset",
  ipLimiter,
  passwordResetProcessLimiter,
  initiatePasswordResetLimiter,
  authController.initiatePasswordReset,
);

router.post(
  "/verifyPasswordResetCode",
  ipLimiter,
  passwordResetProcessLimiter,
  verifyPasswordResetCodeLimiter,
  authController.verifyPasswordResetCode,
);

router.post(
  "/completePasswordReset",
  ipLimiter,
  passwordResetProcessLimiter,
  completePasswordResetLimiter,
  authController.completePasswordReset,
);

router.post(
  "/resendResetCode",
  ipLimiter,
  passwordResetProcessLimiter,
  resendPasswordResetCodeLimiter,
  authController.resendResetCode,
);

router.post(
  "/user/online",
  authMiddleware.requireAuth,
  authController.updateOnlineStatus,
);

router.post(
  "/user/online",
  authMiddleware.requireAuth,
  authController.updateOnlineStatus,
);

export default router;
