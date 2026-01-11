// routes/auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/auth-middleware");
const multerMiddleware = require("../middlewares/multerMiddleware");
const { createRedisRateLimiter } = require("../middlewares/rateLimit");
const {
  ipLimiter,
  initiatePasswordResetLimiter,
  verifyPasswordResetCodeLimiter,
  completePasswordResetLimiter,
  passwordResetProcessLimiter,
  resendPasswordResetCodeLimiter
} = require("../limiters/passwordResetLimiters");
const DeviceAuthManager = require("../middlewares/deviceAuthMiddleware");

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
router.post("/register", DeviceAuthManager.createAuthMiddleware(), authController.register);
router.post("/login", ipLimiter, emailLimiter,DeviceAuthManager.createAuthMiddleware(), authController.login);
router.post("/logout", authMiddleware(['all']), authController.logout);
router.get("/refresh", authMiddleware.refreshMiddleware(), authController.refresh);
router.post("/check", authMiddleware(['all']), authController.check);

// UPDATES
router.post(
  "/updateUser",
  authMiddleware(['all']),
  multerMiddleware({
    fields: "avatar",
    uploadDir: "users",
    maxFileSizeMB: 3,
    imagesOnly: true,
    useTemp: true,
  }),
  authController.updateUser
);

// 2FA CODES
const faLimiter = createRedisRateLimiter({
  keyPrefix: "verify:fa:email",
  windowSec: 60,
  getMax: () => 5,
});

router.post("/verify2faCode", ipLimiter, faLimiter, authController.verify2faCode);

// RESEND CODES
const resend2FaLimiter = createRedisRateLimiter({
  keyPrefix: "verify:fa:resend:email",
  windowSec: 60,
  getMax: () => 3,
});

router.post("/resend2faCode", ipLimiter, resend2FaLimiter, authController.resendFaCode);

// SESSIONS
router.get("/sessions", authMiddleware(['all']), authController.getSessions);
router.patch("/revokeSession", authMiddleware(['all']), authController.revokeSession);

router.post("/changePassword", authMiddleware(['all']), authController.changePassword);

router.post(
  "/initiatePasswordReset",
  ipLimiter,
  passwordResetProcessLimiter, 
  initiatePasswordResetLimiter, 
  authController.initiatePasswordReset
);

router.post(
  "/verifyPasswordResetCode", 
  ipLimiter,
  passwordResetProcessLimiter, 
  verifyPasswordResetCodeLimiter, 
  authController.verifyPasswordResetCode
);

router.post(
  "/completePasswordReset",
  ipLimiter,
  passwordResetProcessLimiter, 
  completePasswordResetLimiter, 
  authController.completePasswordReset
);


router.post(
  "/resendResetCode",
  ipLimiter,
  passwordResetProcessLimiter,
  resendPasswordResetCodeLimiter,
  authController.resendResetCode
);


router.post('/user/online', authMiddleware(['all']), authController.updateOnlineStatus);

module.exports = router;