import { model, Schema } from "mongoose";
import type {
  IUserSearch,
  IUserSearchMethods,
  IUserSearchModel,
  UserSearchDocument,
} from "../types/userSearch.types.js";

const userSearchSchema = new Schema<
  IUserSearch,
  IUserSearchModel,
  IUserSearchMethods
>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    selectedProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { timestamps: true },
);

// Уникальность пары userId + selectedProductId
userSearchSchema.index({ userId: 1, selectedProductId: 1 }, { unique: true });

export default model<IUserSearch, IUserSearchModel>(
  "UserSearch",
  userSearchSchema,
);
