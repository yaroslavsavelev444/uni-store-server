const { Schema, model } = require("mongoose");

const TransportCompanySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = model("TransportCompany", TransportCompanySchema);