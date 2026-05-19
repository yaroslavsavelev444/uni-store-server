// types/passwordReset.ts (новый файл)
import type { NextFunction, Request } from "express";

export interface PasswordResetRequest extends Request {
	body: {
		email?: string;
		[key: string]: any;
	};
	ip: string;
}

export interface RateLimiterConfig {
	keyPrefix: string;
	windowSec: number;
	getMax: (req: PasswordResetRequest) => number;
	getKey: (req: PasswordResetRequest) => string;
	message?: string;
}

export type RateLimiterMiddleware = (
	req: PasswordResetRequest,
	res: Response,
	next: NextFunction,
) => Promise<void>;

// Типы для созданных лимитеров
export interface PasswordResetLimiters {
	ipLimiter: any; // Тип из express-rate-limit
	strictIpLimiter: any;
	initiatePasswordResetLimiter: RateLimiterMiddleware;
	verifyPasswordResetCodeLimiter: RateLimiterMiddleware;
	completePasswordResetLimiter: RateLimiterMiddleware;
	passwordResetProcessLimiter: RateLimiterMiddleware;
	resendPasswordResetCodeLimiter: RateLimiterMiddleware;
}
