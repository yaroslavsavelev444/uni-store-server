import type { Document, Model, Types } from "mongoose";

export interface IButton {
  text?: string | null;
  action?: string | null;
  style?: "primary" | "secondary" | "outline" | null;
}

export interface IContentBlock {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  button?: IButton;
  description?: string;
  position: number;
  isActive: boolean;
  tags: string[];
  metadata?: Record<string, any>;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IContentBlockVirtuals {
  hasButton: boolean;
}

export interface IContentBlockMethods {
  toSafeObject(): any;
  toJSON(): any;
}

export interface ContentBlockModelType extends Model<
  IContentBlockDocument,
  {},
  IContentBlockMethods
> {
  findActive(): Promise<IContentBlockDocument[]>;
  findActiveWithProcessedUrls(): Promise<IContentBlockDocument[]>;
}

export type IContentBlockDocument = Document<unknown, {}, IContentBlock> &
  IContentBlock &
  IContentBlockVirtuals &
  IContentBlockMethods;
