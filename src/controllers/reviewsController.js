const ApiError = require("../exceptions/api-error");
const reviewService = require("../services/reviewService");

const addProductReview = async (req, res, next) => {
  try {
    const { text, productId, rating } = req.body;
    if (!text || !productId) {
      throw ApiError.BadRequest("Отсутствует текст отзыва");
    }
    const review = await reviewService.addProductReview(
      req.user.id,
      text,
      productId,
      rating
    );
    return res.json(review);
  } catch (e) {
    next(e);
  }
};

const addOrgReview = async (req, res, next) => {
  try {
    const { theme, comment } = req.body;
    if (!theme || !comment) {
      throw ApiError.BadRequest("Отсутствует текст отзыва");
    }
    const review = await reviewService.addOrgReview(
      req.user.id,
      theme,
      comment
    );
    return res.json(review);
  } catch (e) {
    next(e);
  }
};


const getOrgReviews = async (req, res, next) => {
  try {
    const reviews = await reviewService.getOrgReviews(req.user);
    return res.json(reviews);
  } catch (e) {
    next(e);
  }
};
const getProductReviews = async (req, res, next) => {
    const { productId } = req.query;
    if(!productId) {
      throw ApiError.BadRequest("Отсутствует productId");
    }
  try {
    const reviews = await reviewService.getProductReviews(productId);
    return res.json(reviews);
  } catch (e) {
    next(e);
  }
};
module.exports = {
  addProductReview,
  addOrgReview,
  getOrgReviews,
  getProductReviews
};
