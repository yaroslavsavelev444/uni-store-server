import type { RedisConfig } from "../types/redis.js";

const redisConfig: RedisConfig = {
	host: process.env.REDIS_HOST || "redis",
	port: parseInt(process.env.REDIS_PORT || "6379", 10),
	maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || "3", 10),
	connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || "180000", 10),
	retryStrategy: (times: number) => {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
	enableOfflineQueue: true,
	autoResendUnfulfilledCommands: true,
	lazyConnect: false, // Connect on instantiation
	showFriendlyErrorStack: process.env.NODE_ENV !== "production",
	enableReadyCheck: true,
	maxLoadingRetryTime: 10000,
};

export default redisConfig;
