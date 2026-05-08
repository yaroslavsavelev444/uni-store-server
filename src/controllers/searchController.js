import ApiError from "../exceptions/api-error.js";
import searchService from "../services/searchService.js";

class SearchController {
  async saveSearchHistory(req, res, next) {
    try {
      const { productId: rawProductId } = req.body;

      // Адаптация под возможный формат { selectedProductId: ... }
      const productId =
        typeof rawProductId === "object" && rawProductId.selectedProductId
          ? rawProductId.selectedProductId
          : rawProductId;

      if (!productId) throw ApiError.BadRequest("Недостаточно данных");

      const record = await searchService.saveSearchHistory(
        req.user.id,
        productId,
      );
      res.json(record);
    } catch (err) {
      next(err);
    }
  }

  async getSearchHistory(req, res, next) {
    try {
      const history = await searchService.getSearchHistory(req.user.id);
      res.json(history);
    } catch (err) {
      next(err);
    }
  }

  async clearSearchHistory(req, res, next) {
    try {
      const result = await searchService.clearSearchHistory(req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
  async getHints(req, res, next) {
    try {
      const { q } = req.query;
      if (!q || q.length < 2) {
        return res.json([]); // возвращаем пустой массив
      }

      const hints = await searchService.getHints(q);
      // Для единообразия с другими методами оборачиваем в объект success/data
      return res.status(200).json({
        success: true,
        data: hints,
      });
    } catch (error) {
      const errorMessage = error?.message || "Unknown error";
      console.error(`[getHints] error: ${errorMessage}`);
      next(
        error instanceof ApiError
          ? error
          : ApiError.InternalServerError(errorMessage),
      );
    }
  }

  async searchProducts(req, res, next) {
    try {
      const { q: query, category, limit = 10, page = 1 } = req.validatedQuery;

      const result = await searchService.searchProducts(query, {
        limit,
        page,
        category,
      });

      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
