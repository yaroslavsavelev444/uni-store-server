const ApiError = require('../exceptions/api-error');
const reviewService = require('../services/reviewService');

const leaveReview = async (req, res, next) => {
    try {
        const { text, productId, rating } = req.body;
        if (!text || !productId) {
            throw ApiError.BadRequest("Отсутствует текст отзыва");
        }
        const review = await reviewService.leaveReviewService(req.user.id, text, productId, rating);
        return res.json(review);
    } catch (e) {
        next(e);
    }
};

module.exports = {
    leaveReview
}