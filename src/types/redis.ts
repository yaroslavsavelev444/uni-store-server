import type { Redis, RedisOptions } from "ioredis";

export interface RedisConfig extends RedisOptions {
  host: string;
  port: number;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  retryStrategy?: (times: number) => number | null;
  enableOfflineQueue?: boolean;
  autoResendUnfulfilledCommands?: boolean;
}

export type RedisValue = string | number | Buffer;
export type RedisKey = string;

export interface PipelineOperation {
  operation: string;
  args: any[];
}

export interface BulkKeyValueTtl {
  key: string;
  ttl: number;
  value: string;
}

export interface RedisHealthStatus {
  connected: boolean;
  ping?: string;
  info?: Partial<RedisInfo>;
  error?: string;
}

export interface RedisInfo {
  redis_version: string;
  connected_clients: number;
  used_memory_human: string;
  total_connections_received: number;
  total_commands_processed: number;
  instantaneous_ops_per_sec: number;
  keyspace_hits: number;
  keyspace_misses: number;
  uptime_in_seconds: number;
}

export interface RedisCommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
}

export interface IRedisClient {
  // Connection methods
  connect(): Promise<Redis>;
  disconnect(): Promise<boolean>;

  // Basic methods
  ping(): Promise<string>;
  set(key: RedisKey, value: RedisValue, ...args: any[]): Promise<"OK">;
  setex(key: RedisKey, seconds: number, value: RedisValue): Promise<"OK">;
  get(key: RedisKey): Promise<string | null>;
  del(...keys: RedisKey[]): Promise<number>;
  exists(key: RedisKey): Promise<number>;
  expire(key: RedisKey, seconds: number): Promise<number>;
  ttl(key: RedisKey): Promise<number>;
  incr(key: RedisKey): Promise<number>;
  decr(key: RedisKey): Promise<number>;

  // Batch operations
  mset(...keyValuePairs: RedisValue[]): Promise<"OK">;
  mget(keys: RedisKey[]): Promise<(string | null)[]>;

  // Pipeline methods
  pipeline(operations: [string, ...any[]][]): Promise<[Error | null, any][]>;
  multi(): Promise<any>;

  // Hash methods
  hset(key: RedisKey, field: string, value: RedisValue): Promise<number>;
  hget(key: RedisKey, field: string): Promise<string | null>;
  hgetall(key: RedisKey): Promise<Record<string, string>>;
  hkeys(key: RedisKey): Promise<string[]>;
  hdel(key: RedisKey, ...fields: string[]): Promise<number>;
  hexists(key: RedisKey, field: string): Promise<number>;
  hincrby(key: RedisKey, field: string, increment: number): Promise<number>;

  // Set methods
  sadd(key: RedisKey, ...members: RedisValue[]): Promise<number>;
  srem(key: RedisKey, ...members: RedisValue[]): Promise<number>;
  smembers(key: RedisKey): Promise<string[]>;
  sismember(key: RedisKey, member: RedisValue): Promise<number>;

  // List methods
  lpush(key: RedisKey, ...values: RedisValue[]): Promise<number>;
  rpush(key: RedisKey, ...values: RedisValue[]): Promise<number>;
  lpop(key: RedisKey): Promise<string | null>;
  rpop(key: RedisKey): Promise<string | null>;
  lrange(key: RedisKey, start: number, stop: number): Promise<string[]>;

  // Sorted set methods
  zadd(
    key: RedisKey,
    ...scoreMemberPairs: (number | string)[]
  ): Promise<number>;
  zrange(
    key: RedisKey,
    start: number,
    stop: number,
    withScores?: boolean,
  ): Promise<string[]>;
  zrem(key: RedisKey, ...members: RedisValue[]): Promise<number>;

  // Key pattern methods
  keys(pattern: string): Promise<string[]>;
  scanStream(options?: {
    match?: string;
    count?: number;
  }): AsyncIterable<string[]>;
  deletePattern(pattern: string): Promise<number>;

  // JSON methods
  setJson<T>(
    key: RedisKey,
    value: T,
    ttlSeconds?: number | null,
  ): Promise<"OK">;
  getJson<T = any>(key: RedisKey): Promise<T | null>;
  delJson(key: RedisKey): Promise<number>;

  // Utility methods
  flushdb(): Promise<"OK">;
  info(section?: string): Promise<string>;
  time(): Promise<[string, string]>;

  // Bulk operations
  bulkSetex(items: BulkKeyValueTtl[]): Promise<[Error | null, any][]>;
  bulkDel(keys: RedisKey[]): Promise<[Error | null, any][]>;
  bulkExists(keys: RedisKey[]): Promise<boolean[]>;

  // Health check
  healthCheck(): Promise<RedisHealthStatus>;
}
