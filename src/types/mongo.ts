import { Connection } from "mongoose";

export interface CollectionInfo {
  name: string;
  [key: string]: any;
}

export interface MongoConnectionOptions {
  serverSelectionTimeoutMS: number;
  socketTimeoutMS: number;
}

export interface MongoError extends Error {
  code?: number;
  codeName?: string;
}
