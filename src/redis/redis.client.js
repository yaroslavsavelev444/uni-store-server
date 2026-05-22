// redis/redis.client.js
const Redis = require('ioredis');
const logger = require('../logger/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return this.client;

    this.client = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: 3,
      connectTimeout: 180000,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableOfflineQueue: true,
      autoResendUnfulfilledCommands: true
    });

    return new Promise((resolve, reject) => {
      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('[Redis] Connected successfully');
        resolve(this.client);
      });

      this.client.on('error', (err) => {
        logger.error(`[Redis] Connection error: ${err.message}`);
        if (!this.isConnected) reject(err);
      });

      this.client.on('reconnecting', () => {
        logger.warn('[Redis] Reconnecting...');
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.info('[Redis] Connection closed');
      });
    });
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('[Redis] Disconnected gracefully');
      return true;
    }
    return false;
  }

  // ========== BASIC METHODS ==========
  async ping() {
    if (!this.isConnected) await this.connect();
    return this.client.ping();
  }

  async set(key, value, ...args) {
    if (!this.isConnected) await this.connect();
    return this.client.set(key, value, ...args);
  }

  async setex(key, seconds, value) {
    if (!this.isConnected) await this.connect();
    return this.client.setex(key, seconds, value);
  }

  async get(key) {
    if (!this.isConnected) await this.connect();
    return this.client.get(key);
  }

  async del(key) {
    if (!this.isConnected) await this.connect();
    return this.client.del(key);
  }

  async exists(key) {
    if (!this.isConnected) await this.connect();
    return this.client.exists(key);
  }

  async expire(key, seconds) {
    if (!this.isConnected) await this.connect();
    return this.client.expire(key, seconds);
  }

  async ttl(key) {
    if (!this.isConnected) await this.connect();
    return this.client.ttl(key);
  }

  async incr(key) {
    if (!this.isConnected) await this.connect();
    return this.client.incr(key);
  }

  async decr(key) {
    if (!this.isConnected) await this.connect();
    return this.client.decr(key);
  }

  // ========== BATCH OPERATIONS ==========
  async mset(...keyValuePairs) {
    if (!this.isConnected) await this.connect();
    return this.client.mset(...keyValuePairs);
  }

  async mget(keys) {
    if (!this.isConnected) await this.connect();
    return this.client.mget(keys);
  }

  // ========== PIPELINE METHODS ==========
  async pipeline(operations) {
    if (!this.isConnected) await this.connect();
    const pipeline = this.client.pipeline();
    
    operations.forEach(([operation, ...args]) => {
      pipeline[operation](...args);
    });
    
    return pipeline.exec();
  }

  async multi() {
    if (!this.isConnected) await this.connect();
    return this.client.multi();
  }

  // ========== HASH METHODS ==========
  async hset(key, field, value) {
    if (!this.isConnected) await this.connect();
    return this.client.hset(key, field, value);
  }

  async hget(key, field) {
    if (!this.isConnected) await this.connect();
    return this.client.hget(key, field);
  }

  async hgetall(key) {
    if (!this.isConnected) await this.connect();
    return this.client.hgetall(key);
  }

  async hkeys(key) {
    if (!this.isConnected) await this.connect();
    return this.client.hkeys(key);
  }

  async hdel(key, ...fields) {
    if (!this.isConnected) await this.connect();
    return this.client.hdel(key, ...fields);
  }

  async hexists(key, field) {
    if (!this.isConnected) await this.connect();
    return this.client.hexists(key, field);
  }

  async hincrby(key, field, increment) {
    if (!this.isConnected) await this.connect();
    return this.client.hincrby(key, field, increment);
  }

  // ========== SET METHODS ==========
  async sadd(key, ...members) {
    if (!this.isConnected) await this.connect();
    return this.client.sadd(key, ...members);
  }

  async srem(key, ...members) {
    if (!this.isConnected) await this.connect();
    return this.client.srem(key, ...members);
  }

  async smembers(key) {
    if (!this.isConnected) await this.connect();
    return this.client.smembers(key);
  }

  async sismember(key, member) {
    if (!this.isConnected) await this.connect();
    return this.client.sismember(key, member);
  }

  // ========== LIST METHODS ==========
  async lpush(key, ...values) {
    if (!this.isConnected) await this.connect();
    return this.client.lpush(key, ...values);
  }

  async rpush(key, ...values) {
    if (!this.isConnected) await this.connect();
    return this.client.rpush(key, ...values);
  }

  async lpop(key) {
    if (!this.isConnected) await this.connect();
    return this.client.lpop(key);
  }

  async rpop(key) {
    if (!this.isConnected) await this.connect();
    return this.client.rpop(key);
  }

  async lrange(key, start, stop) {
    if (!this.isConnected) await this.connect();
    return this.client.lrange(key, start, stop);
  }

  // ========== SORTED SET METHODS ==========
  async zadd(key, ...scoreMemberPairs) {
    if (!this.isConnected) await this.connect();
    return this.client.zadd(key, ...scoreMemberPairs);
  }

  async zrange(key, start, stop, withScores = false) {
    if (!this.isConnected) await this.connect();
    const args = [key, start, stop];
    if (withScores) args.push('WITHSCORES');
    return this.client.zrange(...args);
  }

  async zrem(key, ...members) {
    if (!this.isConnected) await this.connect();
    return this.client.zrem(key, ...members);
  }

  // ========== KEY PATTERN METHODS ==========
  async keys(pattern) {
    if (!this.isConnected) await this.connect();
    return this.client.keys(pattern);
  }

  async scanStream(options = {}) {
    if (!this.isConnected) await this.connect();
    return this.client.scanStream(options);
  }

  async deletePattern(pattern) {
    if (!this.isConnected) await this.connect();
    const stream = this.client.scanStream({
      match: pattern,
      count: 100
    });
    
    const keys = [];
    for await (const resultKeys of stream) {
      keys.push(...resultKeys);
    }
    
    if (keys.length > 0) {
      return this.client.del(...keys);
    }
    return 0;
  }

  // ========== JSON METHODS ==========
  async setJson(key, value, ttlSeconds = null) {
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      return this.setex(key, ttlSeconds, stringValue);
    } else {
      return this.set(key, stringValue);
    }
  }

  async getJson(key) {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async delJson(key) {
    return this.del(key);
  }

  // ========== UTILITY METHODS ==========
  async flushdb() {
    if (!this.isConnected) await this.connect();
    return this.client.flushdb();
  }

  async info(section = null) {
    if (!this.isConnected) await this.connect();
    return section ? this.client.info(section) : this.client.info();
  }

  async time() {
    if (!this.isConnected) await this.connect();
    return this.client.time();
  }

  // ========== BULK OPERATIONS (специально для SessionService) ==========
  async bulkSetex(keyValueTtlArray) {
    if (!this.isConnected) await this.connect();
    const pipeline = this.client.pipeline();
    
    keyValueTtlArray.forEach(([key, ttl, value]) => {
      pipeline.setex(key, ttl, value);
    });
    
    return pipeline.exec();
  }

  async bulkDel(keys) {
    if (!this.isConnected) await this.connect();
    if (keys.length === 0) return [];
    
    const pipeline = this.client.pipeline();
    keys.forEach(key => {
      pipeline.del(key);
    });
    
    return pipeline.exec();
  }

  async bulkExists(keys) {
    if (!this.isConnected) await this.connect();
    if (keys.length === 0) return [];
    
    const pipeline = this.client.pipeline();
    keys.forEach(key => {
      pipeline.exists(key);
    });
    
    const results = await pipeline.exec();
    return results.map(([err, exists]) => exists === 1);
  }
}

// Синглтон-экземпляр
const redisInstance = new RedisClient();

// Автоматическое подключение при инициализации
(async () => {
  try {
    await redisInstance.connect();
  } catch (err) {
    logger.error(`[Redis] Initial connection failed: ${err.message}`);
  }
})();

module.exports = redisInstance;