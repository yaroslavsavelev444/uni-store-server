const { ProductReviewModel, OrgReview } = require("../models/indexModels");

const addProductReview = async (userId, text, productId, rating) => {
    const review = await ProductReviewModel.create({ userId, text, productId, rating });
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
//ADMIN
const updateReviewStatus = async (id, status) => {
    if(status === 'delete') { 
        const review = await OrgReview.findByIdAndDelete(id);
        return review;
    }
    const review = await OrgReview.findByIdAndUpdate(id, { status });
    return review;
};


module.exports = {
    addProductReview,
    addOrgReview,
    updateReviewStatus,
    getOrgReviews,
    getProductReviews
};