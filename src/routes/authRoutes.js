// routes/auth.js
import { Router } from "express";

const router = Router();

import {
	changePassword,
	check,
	completePasswordReset,
	getSessions,
	initiatePasswordReset,
	login,
	logout,
	refresh,
	register,
	resendFaCode,
	resendResetCode,
	revokeSession,
	updateOnlineStatus,
	updateUser,
	verify2faCode,
	verifyPasswordResetCode,
} from "../controllers/authController";
import {
	completePasswordResetLimiter,
	initiatePasswordResetLimiter,
	ipLimiter,
	passwordResetProcessLimiter,
	resendPasswordResetCodeLimiter,
	verifyPasswordResetCodeLimiter,
} from "../limiters/passwordResetLimiters";
import authMiddleware from "../middlewares/auth-middleware";
import { createAuthMiddleware } from "../middlewares/deviceAuthMiddleware";
import multerMiddleware from "../middlewares/multerMiddleware";
import { createRedisRateLimiter } from "../middlewares/rateLimit";

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
router.post("/register", createAuthMiddleware(), register);
router.post("/login", ipLimiter, emailLimiter, createAuthMiddleware(), login);
router.post("/logout", authMiddleware(["all"]), logout);
router.get("/refresh", authMiddleware.refreshMiddleware(), refresh);
router.post("/check", check);

// UPDATES
router.post(
	"/updateUser",
	authMiddleware(["all"]),
	multerMiddleware({
		fields: "avatar",
		uploadDir: "users",
		maxFileSizeMB: 3,
		imagesOnly: true,
		useTemp: true,
	}),
	updateUser,
);

// 2FA CODES
const faLimiter = createRedisRateLimiter({
	keyPrefix: "verify:fa:email",
	windowSec: 60,
	getMax: () => 5,
});

router.post("/verify2faCode", ipLimiter, faLimiter, verify2faCode);

// RESEND CODES
const resend2FaLimiter = createRedisRateLimiter({
	keyPrefix: "verify:fa:resend:email",
	windowSec: 60,
	getMax: () => 3,
});

router.post("/resend2faCode", ipLimiter, resend2FaLimiter, resendFaCode);

// SESSIONS
router.get("/sessions", authMiddleware(["all"]), getSessions);
router.patch("/revokeSession", authMiddleware(["all"]), revokeSession);

router.post("/changePassword", authMiddleware(["all"]), changePassword);

router.post(
	"/initiatePasswordReset",
	ipLimiter,
	passwordResetProcessLimiter,
	initiatePasswordResetLimiter,
	initiatePasswordReset,
);

router.post(
	"/verifyPasswordResetCode",
	ipLimiter,
	passwordResetProcessLimiter,
	verifyPasswordResetCodeLimiter,
	verifyPasswordResetCode,
);

router.post(
	"/completePasswordReset",
	ipLimiter,
	passwordResetProcessLimiter,
	completePasswordResetLimiter,
	completePasswordReset,
);

router.post(
	"/resendResetCode",
	ipLimiter,
	passwordResetProcessLimiter,
	resendPasswordResetCodeLimiter,
	resendResetCode,
);

router.post("/user/online", authMiddleware(["all"]), updateOnlineStatus);

export default router;
