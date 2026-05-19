import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import searchService from "../services/searchService.js";
import type {
  ClearSearchHistoryReq,
  ClearSearchHistoryResponse,
  GetHintsReq,
  GetHintsResponse,
  GetSearchHistoryReq,
  GetSearchHistoryResponse,
  SaveSearchHistoryReq,
  SaveSearchHistoryResponse,
  SearchProductsReq,
  SearchProductsResponse,
} from "../types/controllers/search-controller.js";

class SearchController {
  /**
   * POST /api/search/history
   * Сохранить запись в истории поиска
   */
  saveSearchHistory = async (
    req: SaveSearchHistoryReq,
    res: Response<SaveSearchHistoryResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId: rawProductId } = req.body;

      let productId: string;
      if (typeof rawProductId === "object" && rawProductId?.selectedProductId) {
        productId = rawProductId.selectedProductId;
      } else if (typeof rawProductId === "string") {
        productId = rawProductId;
      } else {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const record = await searchService.saveSearchHistory(
        req.user.id,
        productId,
      );
      res.json(record);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/search/history
   * Получить историю поиска пользователя
   */
  getSearchHistory = async (
    req: GetSearchHistoryReq,
    res: Response<GetSearchHistoryResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const history = await searchService.getSearchHistory(req.user.id);
      res.json(history as GetSearchHistoryResponse);
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/search/history
   * Очистить историю поиска пользователя
   */
  clearSearchHistory = async (
    req: ClearSearchHistoryReq,
    res: Response<ClearSearchHistoryResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await searchService.clearSearchHistory(req.user.id);
      res.json(result as ClearSearchHistoryResponse);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/search/hints?q=...
   * Получить подсказки для поиска
   */
  getHints = async (
    req: GetHintsReq,
    res: Response<GetHintsResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { q } = req.query;
      if (!q || q.length < 2) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const hints = await searchService.getHints(q);
      res.status(200).json({
        success: true,
        data: hints,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[getHints] error: ${errorMessage}`);
      next(
        error instanceof ApiError
          ? error
          : ApiError.InternalServerError(errorMessage),
      );
    }
  };

  /**
   * GET /api/search/products?q=...&category=...&limit=10&page=1
   * Поиск товаров с пагинацией
   */
  searchProducts = async (
    req: SearchProductsReq,
    res: Response<SearchProductsResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = req.validatedQuery;
      const query = validated?.q ?? (req.query.q as string);
      const category = validated?.category ?? (req.query.category as string);
      const limit =
        validated?.limit ??
        (req.query.limit ? parseInt(req.query.limit as string, 10) : 10);
      const page =
        validated?.page ??
        (req.query.page ? parseInt(req.query.page as string, 10) : 1);

      if (!query) {
        throw ApiError.BadRequest("Параметр 'q' обязателен");
      }

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
  };
}

export default new SearchController();
