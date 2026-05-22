import Redis, {
  type ChainableCommander,
  type Redis as RedisInstance,
} from "ioredis";
import logger from "../logger/logger.js";
import type {
  BulkKeyValueTtl,
  IRedisClient,
  RedisHealthStatus,
  RedisInfo,
  RedisValue,
} from "../types/redis.js";
import redisConfig from "./redisConfig.js";

class RedisClient implements IRedisClient {
  private client: RedisInstance | null = null;
  private isConnected: boolean = false;
  private connectionPromise: Promise<RedisInstance> | null = null;

  constructor() {
    // Автоматическое подключение при создании экземпляра
    this.connect().catch((err) => {
      logger.error(`[Redis] Initial connection failed: ${err.message}`);
    });
  }

  /**
   * Connect to Redis server
   */
  async connect(): Promise<RedisInstance> {
    if (this.isConnected && this.client) {
      return this.client;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Исправлено: используем локальную переменную вместо прямой работы с this.client
        //@ts-expect-error
        const client = new Redis(redisConfig);

        // Присваиваем this.client после успешного создания
        this.client = client;

        client.on("connect", () => {
          this.isConnected = true;
          logger.info("[Redis] Connected successfully");
          resolve(client); // Исправлено: убран non-null assertion
        });

        client.on("ready", () => {
          logger.info("[Redis] Ready to accept commands");
        });

        client.on("error", (err: Error) => {
          logger.error(`[Redis] Connection error: ${err.message}`);
          if (!this.isConnected) {
            reject(err);
          }
        });

        client.on("reconnecting", (delay: number) => {
          logger.warn(`[Redis] Reconnecting in ${delay}ms...`);
        });

        client.on("end", () => {
          this.isConnected = false;
          this.connectionPromise = null;
          logger.info("[Redis] Connection closed");
        });
      } catch (err) {
        reject(err);
      }
    });

    return this.connectionPromise;
  }
  /**
   * Disconnect from Redis server
   */
  async disconnect(): Promise<boolean> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      this.connectionPromise = null;
      logger.info("[Redis] Disconnected gracefully");
      return true;
    }
    return false;
  }

  /**
   * Ensure connection is established before executing command
   */
  private async ensureConnection(): Promise<RedisInstance> {
    if (!this.isConnected || !this.client) {
      return this.connect();
    }
    return this.client;
  }

  /**
   * Execute Redis command with error handling
   */
  private async executeCommand<T>(
    command: (client: RedisInstance) => Promise<T>,
    fallbackValue?: T,
  ): Promise<T> {
    try {
      const client = await this.ensureConnection();
      return await command(client);
    } catch (error) {
      logger.error(
        `[Redis] Command execution failed: ${(error as Error).message}`,
      );
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw error;
    }
  }

  // ========== BASIC METHODS ==========

  async ping(): Promise<string> {
    return this.executeCommand((client) => client.ping());
  }

  async set(key: string, value: RedisValue, ...args: any[]): Promise<"OK"> {
    return this.executeCommand((client) => client.set(key, value, ...args));
  }

  async setex(key: string, seconds: number, value: RedisValue): Promise<"OK"> {
    return this.executeCommand((client) => client.setex(key, seconds, value));
  }

  async get(key: string): Promise<string | null> {
    return this.executeCommand((client) => client.get(key));
  }

  async del(...keys: string[]): Promise<number> {
    return this.executeCommand((client) => client.del(...keys));
  }

  async exists(key: string): Promise<number> {
    return this.executeCommand((client) => client.exists(key));
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.executeCommand((client) => client.expire(key, seconds));
  }

  async ttl(key: string): Promise<number> {
    return this.executeCommand((client) => client.ttl(key));
  }

  async incr(key: string): Promise<number> {
    return this.executeCommand((client) => client.incr(key));
  }

  async decr(key: string): Promise<number> {
    return this.executeCommand((client) => client.decr(key));
  }

  // ========== BATCH OPERATIONS ==========

  async mset(...keyValuePairs: RedisValue[]): Promise<"OK"> {
    return this.executeCommand((client) => client.mset(...keyValuePairs));
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return this.executeCommand((client) => client.mget(keys));
  }

  // ========== PIPELINE METHODS ==========

  async pipeline(
    operations: [string, ...any[]][],
  ): Promise<[Error | null, any][]> {
    return this.executeCommand((client) => {
      const pipeline = client.pipeline();
      operations.forEach(([operation, ...args]) => {
        (pipeline as any)[operation](...args);
      });
      return pipeline.exec() as Promise<[Error | null, any][]>;
    });
  }

  async multi(): Promise<ChainableCommander> {
    const client = await this.ensureConnection();
    return client.multi();
  }

  // ========== HASH METHODS ==========

  async hset(key: string, field: string, value: RedisValue): Promise<number> {
    return this.executeCommand((client) => client.hset(key, field, value));
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.executeCommand((client) => client.hget(key, field));
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.executeCommand((client) => client.hgetall(key), {});
  }

  async hkeys(key: string): Promise<string[]> {
    return this.executeCommand((client) => client.hkeys(key), []);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.executeCommand((client) => client.hdel(key, ...fields));
  }

  async hexists(key: string, field: string): Promise<number> {
    return this.executeCommand((client) => client.hexists(key, field));
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return this.executeCommand((client) =>
      client.hincrby(key, field, increment),
    );
  }

  // ========== SET METHODS ==========

  async sadd(key: string, ...members: RedisValue[]): Promise<number> {
    return this.executeCommand((client) => client.sadd(key, ...members));
  }

  async srem(key: string, ...members: RedisValue[]): Promise<number> {
    return this.executeCommand((client) => client.srem(key, ...members));
  }

  async smembers(key: string): Promise<string[]> {
    return this.executeCommand((client) => client.smembers(key), []);
  }

  async sismember(key: string, member: RedisValue): Promise<number> {
    return this.executeCommand((client) => client.sismember(key, member));
  }

  // ========== LIST METHODS ==========

  async lpush(key: string, ...values: RedisValue[]): Promise<number> {
    return this.executeCommand((client) => client.lpush(key, ...values));
  }

  async rpush(key: string, ...values: RedisValue[]): Promise<number> {
    return this.executeCommand((client) => client.rpush(key, ...values));
  }

  async lpop(key: string): Promise<string | null> {
    return this.executeCommand((client) => client.lpop(key));
  }

  async rpop(key: string): Promise<string | null> {
    return this.executeCommand((client) => client.rpop(key));
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeCommand((client) => client.lrange(key, start, stop), []);
  }

  // ========== SORTED SET METHODS ==========

  async zadd(
    key: string,
    ...scoreMemberPairs: (number | string)[]
  ): Promise<number> {
    return this.executeCommand((client) =>
      client.zadd(key, ...scoreMemberPairs),
    );
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    withScores: boolean = false,
  ): Promise<string[]> {
    return this.executeCommand((client) => {
      if (withScores) {
        return client.zrange(key, start, stop, "WITHSCORES");
      }
      return client.zrange(key, start, stop);
    }, []);
  }

  async zrem(key: string, ...members: RedisValue[]): Promise<number> {
    return this.executeCommand((client) => client.zrem(key, ...members));
  }

  // ========== KEY PATTERN METHODS ==========

  async keys(pattern: string): Promise<string[]> {
    return this.executeCommand((client) => client.keys(pattern), []);
  }

  // ✅ Исправлено: правильный возвращаемый тип AsyncIterable<string[]>
  scanStream(
    options: { match?: string; count?: number } = {},
  ): AsyncIterable<string[]> {
    const client = this.client;
    if (!client) {
      throw new Error("Redis client not connected");
    }
    return client.scanStream({
      match: options.match,
      count: options.count || 100,
    });
  }

  async deletePattern(pattern: string): Promise<number> {
    const client = await this.ensureConnection();
    const stream = client.scanStream({
      match: pattern,
      count: 100,
    });

    const keys: string[] = [];
    for await (const resultKeys of stream) {
      keys.push(...resultKeys);
    }

    if (keys.length > 0) {
      return client.del(...keys);
    }
    return 0;
  }

  // ========== JSON METHODS ==========

  async setJson<T>(
    key: string,
    value: T,
    ttlSeconds: number | null = null,
  ): Promise<"OK"> {
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      return this.setex(key, ttlSeconds, stringValue);
    }
    return this.set(key, stringValue);
  }

  async getJson<T = any>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`[Redis] Failed to parse JSON for key ${key}: ${error}`);
      return null;
    }
  }

  async delJson(key: string): Promise<number> {
    return this.del(key);
  }

  // ========== UTILITY METHODS ==========

  async flushdb(): Promise<"OK"> {
    return this.executeCommand((client) => client.flushdb());
  }

  async info(section?: string): Promise<string> {
    return this.executeCommand((client) =>
      section ? client.info(section) : client.info(),
    );
  }

  async time(): Promise<[string, string]> {
    return this.executeCommand(async (client) => {
      const [seconds, microseconds] = await client.time();
      return [seconds.toString(), microseconds.toString()];
    });
  }

  // ========== BULK OPERATIONS ==========

  async bulkSetex(items: BulkKeyValueTtl[]): Promise<[Error | null, any][]> {
    if (items.length === 0) return [];

    return this.executeCommand((client) => {
      const pipeline = client.pipeline();
      items.forEach(({ key, ttl, value }) => {
        pipeline.setex(key, ttl, value);
      });
      return pipeline.exec() as Promise<[Error | null, any][]>;
    }, []);
  }

  async bulkDel(keys: string[]): Promise<[Error | null, any][]> {
    if (keys.length === 0) return [];

    return this.executeCommand((client) => {
      const pipeline = client.pipeline();
      keys.forEach((key) => {
        pipeline.del(key);
      });
      return pipeline.exec() as Promise<[Error | null, any][]>;
    }, []);
  }

  async bulkExists(keys: string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];

    const results = await this.executeCommand((client) => {
      const pipeline = client.pipeline();
      keys.forEach((key) => {
        pipeline.exists(key);
      });
      return pipeline.exec() as Promise<[Error | null, any][]>;
    }, []);

    return results.map(([err, exists]) => !err && exists === 1);
  }

  // ========== HEALTH CHECK ==========

  async healthCheck(): Promise<RedisHealthStatus> {
    try {
      const ping = await this.ping();
      const infoStr = await this.info();

      // Parse Redis info
      const info: Partial<RedisInfo> = {};
      infoStr.split("\r\n").forEach((line) => {
        const [key, value] = line.split(":");
        if (key && value) {
          (info as any)[key.trim()] = value.trim();
        }
      });

      return {
        connected: this.isConnected,
        ping,
        info,
      };
    } catch (error) {
      return {
        connected: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get raw Redis client instance (use with caution)
   */
  getRawClient(): RedisInstance | null {
    return this.client;
  }

  /**
   * Check if connected to Redis
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Создаем и экспортируем singleton instance
const redisClient = new RedisClient();

// Graceful shutdown
process.on("SIGTERM", async () => {
  await redisClient.disconnect();
});

process.on("SIGINT", async () => {
  await redisClient.disconnect();
});

export default redisClient;
