const { Schema, model } = require("mongoose");

const ContentBlockSchema = new Schema(
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
  { _id: false }
);

const TopicCommonSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    position: { type: Number, default: 0 },

    // Поля, которые раньше были в статье
    imageUrl: { type: String, default: "" },
    readingTime: { type: Number, default: 0 },
    contentBlocks: { type: [ContentBlockSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

module.exports = model("TopicCommon", TopicCommonSchema);