const ApiError = require("../exceptions/api-error");
const { ProductReviewModel, OrgReview } = require("../models/indexModels");
const { sendEmailNotification } = require("../queues/taskQueues");
const { checkIfUserBoughtProduct } = require("./productService");


const getReviews = async () => {
    return await ProductReviewModel.find().populate("user", "name");
}
const addProductReview = async (userId, productId, { pros, cons, comment, rating }) => {
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

const addOrgReview = async (userId, theme, comment) => {
    return await OrgReview.create({ userId, theme, comment });
};
const getOrgReviews = async () => {
   return await OrgReview.find({status: "accept"}).populate("userId", "name");
};
const getProductReviews = async (productId) => {
    return await ProductReviewModel.find({ productId });;
};
const getUserReviews = async (userId) => {
    return await ProductReviewModel.find({ user: userId }).populate("user", "name")
    .sort({ createdAt: -1 });;
};
//ADMIN
const updateReviewStatus = async (id, status) => {
    return await ProductReviewModel.findByIdAndUpdate(id, { status });
};

const updateOrgReviewStatus = async (id, status) => {
    return await OrgReview.findByIdAndUpdate(id, { status });
};

module.exports = {
    addProductReview,
    addOrgReview,
    updateReviewStatus,
    getOrgReviews,
    getProductReviews,
    getUserReviews,
    getReviews,
    updateOrgReviewStatus
};