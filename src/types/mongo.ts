import type { W } from "mongodb";
import { Connection } from "mongoose";

export interface CollectionInfo {
  name: string;
  [key: string]: any;
}

export interface MongoConnectionOptions {
  serverSelectionTimeoutMS: number;
  socketTimeoutMS: number;
  connectTimeoutMS: number;
  heartbeatFrequencyMS: number;
  retryWrites: true;
  w: W;
}

export interface MongoError extends Error {
  code?: number;
  codeName?: string;
}
