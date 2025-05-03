const { ReviewModel } = require("../models/indexModels");

const leaveReviewService = async (userId, text, productId, rating) => {
    const review = await ReviewModel.create({ userId, text, productId, rating });
    return review;
};

const submitReviewService = async (reviewId, status) => {
    const review = await ReviewModel.findOneAndUpdate({ _id: reviewId }, { status });
    return review;
};

const deleteReviewService = async (reviewId) => {
    const review = await ReviewModel.findOneAndDelete({ _id: reviewId });
    return review;
}
module.exports = {
    leaveReviewService,
    submitReviewService,
    deleteReviewService
};