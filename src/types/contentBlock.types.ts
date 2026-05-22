import type { Document, Model, PopulatedDoc, Types } from "mongoose";
import type { IFile } from "./file.types.js";

export interface IButton {
  text?: string | null;
  action?: string | null;
  style?: "primary" | "secondary" | "outline" | null;
}

// Базовые поля, сохраняемые в БД
export interface IContentBlock {
  title: string;
  subtitle: string;
  imageUrl?: string | PopulatedDoc<IFile> | null; // теперь может быть populate
  button?: IButton;
  description?: string;
  position: number;
  isActive: boolean;
  tags: string[];
  metadata?: Record<string, unknown>;

  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// Полный документ с виртуалами и методами
export interface IContentBlockDocument extends Document, IContentBlock {
  // Виртуальные поля
  hasButton: boolean;

  // Методы экземпляра
  toSafeObject(): any;
  toJSON(): any;
}

// Статические методы модели
export interface ContentBlockModel extends Model<IContentBlockDocument> {
  findActive(): Promise<IContentBlockDocument[]>;
  findActiveWithProcessedUrls(): Promise<IContentBlockDocument[]>;
}
