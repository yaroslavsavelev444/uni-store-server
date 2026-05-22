const { Schema, model } = require("mongoose");

const messageSchema = new Schema({
  room: { 
    type: Schema.Types.ObjectId, 
    ref: "Room", 
    required: true,
    index: true 
  },
  sender: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  receiver: { 
    type: Schema.Types.ObjectId, 
    ref: "User",
    required: false,
  },
  data: {
    type: Schema.Types.Mixed,
    default: null
  },
  text: String,
  command: { type: String, required: false },
  image: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, read: 1 });

module.exports = model("Message", messageSchema);