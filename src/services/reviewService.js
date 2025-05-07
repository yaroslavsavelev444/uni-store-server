const ApiError = require("../exceptions/api-error");
const { ProductReviewModel, OrgReview } = require("../models/indexModels");
const { sendEmailNotification } = require("../queues/taskQueues");
const { checkIfUserBoughtProduct } = require("./productService");


const getReviews = async () => {
    const reviews = await ProductReviewModel.find().populate("user", "name");
    return reviews;
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
    const review = await OrgReview.create({ userId, theme, comment });
    return review;
};
const getOrgReviews = async (user) => {
    if(user.role === "admin" || user.role === "superadmin") {
        const reviews = await OrgReview.find({}).populate("userId");
        return reviews;
    }
    const reviews = await OrgReview.find({ status: "active" }).populate("userId");
        return reviews;
};
const getProductReviews = async (productId) => {
    const reviews = await ProductReviewModel.find({ productId });
    return reviews;
};
const getUserReviews = async (userId) => {
    const reviews = await ProductReviewModel.find({ user: userId }).populate("user", "name")
    .sort({ createdAt: -1 });;
    return reviews;
};
//ADMIN
const updateReviewStatus = async (id, status) => {
    const review = await ProductReviewModel.findByIdAndUpdate(id, { status });
    return review;
};


module.exports = {
    addProductReview,
    addOrgReview,
    updateReviewStatus,
    getOrgReviews,
    getProductReviews,
    getUserReviews,
    getReviews
};