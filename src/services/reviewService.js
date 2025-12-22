const ApiError = require("../exceptions/api-error");
const { ProductReviewModel } = require("../models/index.models");
const { sendEmailNotification } = require("../queues/taskQueues");
const { checkIfUserBoughtProduct } = require("./productService");

const getProductsReviews = async () => {
  return await ProductReviewModel.find().populate("user");
};

const getProductReviews = async (productId) => {
  return await ProductReviewModel.find({ productId }).populate("user");
};

const addProductReview = async (
  userId,
  productId,
  { pros, cons, comment, rating }
) => {
  const hasBought = await checkIfUserBoughtProduct(userId, productId);
  if (!hasBought) {
    throw ApiError.BadRequest("Вы не купили данный товар");
  }

  const review = await ProductReviewModel.create({
    user: userId,
    productId,
    pros,
    cons,
    comment,
    rating,
  });

  sendEmailNotification(process.env.SMTP_USER, "newProductReview", {
    reviewData: review.toObject(),
  });

  return review;
};

const update = async (id, data) => {
  return await ProductReviewModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

module.exports = {
  addProductReview,
  getProductsReviews,
  getProductReviews,
  update,
};
