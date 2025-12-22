const ApiError = require("../exceptions/api-error");
const reviewService = require("../services/reviewService");

const add = async (req, res, next) => {
  try {
    const { pros, cons, comment, rating } = req.body;
    const { id: productId } = req.params;

    if (!pros || !cons || !comment || !rating || !productId) {
      throw ApiError.BadRequest("Не заполнены все поля отзыва");
    }

    // сохраняем как один текст или раздельно (лучше раздельно)
    const review = await reviewService.addProductReview(
      req.user.id,
      productId,
      { pros, cons, comment, rating }
    );

    return res.json(review);
  } catch (e) {
    next(e);
  }
};

const get = async (req, res, next) => {
  const { productId } = req.query;
  if (!productId) {
    throw ApiError.BadRequest("Отсутствует productId");
  }
  try {
    const reviews = await reviewService.getProductReviews(productId);
    return res.json(reviews);
  } catch (e) {
    next(e);
  }
};

const getUserReviews = async (req, res, next) => {
  try {
    const reviews = await reviewService.getUserReviews(req.user.id);
    return res.json(reviews);
  } catch (e) {
    next(e);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw ApiError.BadRequest("Отсутствует id");
    }
    const result = await reviewService.updateReview(id, req.body);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
module.exports = {
  add,
  get,
  getUserReviews,
  update,
};
