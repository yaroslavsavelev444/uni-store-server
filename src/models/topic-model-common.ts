import { model, Schema } from "mongoose";
import type {
  IContentBlock,
  ITopicCommon,
  ITopicCommonMethods,
  ITopicCommonModel,
} from "../types/topicCommon.types.js";

// Схема для вложенного документа ContentBlock (без _id)
const ContentBlockSchema = new Schema<IContentBlock>(
  {
    type: {
      type: String,
      enum: ["text", "image", "link", "heading", "list", "highlighted"],
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false },
);

// Основная схема TopicCommon
const TopicCommonSchema = new Schema<
  ITopicCommon,
  ITopicCommonModel,
  ITopicCommonMethods
>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    position: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    readingTime: { type: Number, default: 0 },
    contentBlocks: { type: [ContentBlockSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

export default model<ITopicCommon, ITopicCommonModel>(
  "TopicCommon",
  TopicCommonSchema,
);
