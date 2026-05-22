// controllers/wishlistController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import wishlistService from "../services/wishlistService.js";
import type {
  AddProductReq,
  ClearWishlistReq,
  GetCountReq,
  GetPaginatedReq,
  GetProductIdsReq,
  GetSummaryReq,
  GetWishlistReq,
  IsInWishlistReq,
  RemoveProductReq,
  ToggleProductReq,
} from "../types/controllers/wishlist-controller.js";

class WishlistController {
  getWishlist = async (
    req: GetWishlistReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id; // гарантирован middleware auth
      const products = await wishlistService.getWishlist(userId);
      res.json(products);
    } catch (error) {
      next(error);
    }
  };

  addProduct = async (
    req: AddProductReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const { productId, notes } = req.body;
      if (!productId) {
        throw ApiError.BadRequest("Не указан ID товара");
      }
      const products = await wishlistService.addProduct(
        userId,
        productId,
        notes,
      );
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  removeProduct = async (
    req: RemoveProductReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const { productId } = req.params;
      if (!productId) {
        throw ApiError.BadRequest("Не указан ID товара");
      }
      const products = await wishlistService.removeProduct(userId, productId);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  clearWishlist = async (
    req: ClearWishlistReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const products = await wishlistService.clearWishlist(userId);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  };

  toggleProduct = async (
    req: ToggleProductReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const { productId, notes } = req.body;
      if (!productId) {
        throw ApiError.BadRequest("Не указан ID товара");
      }
      const products = await wishlistService.toggleProduct(
        userId,
        productId,
        notes,
      );
      const exists = products.some((p) => p._id.toString() === productId);
      res.status(200).json({
        products,
        action: exists ? "added" : "removed",
        message: exists
          ? "Товар добавлен в избранное"
          : "Товар удален из избранного",
      });
    } catch (error) {
      next(error);
    }
  };

  getSummary = async (
    req: GetSummaryReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const summary = await wishlistService.getWishlistSummary(userId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };

  isInWishlist = async (
    req: IsInWishlistReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const { productId } = req.params;
      if (!productId) {
        throw ApiError.BadRequest("Не указан ID товара");
      }
      const isInWishlist = await wishlistService.isInWishlist(
        userId,
        productId,
      );
      res.json({ isInWishlist });
    } catch (error) {
      next(error);
    }
  };

  getProductIds = async (
    req: GetProductIdsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const productIds = await wishlistService.getWishlistProductIds(userId);
      res.json(productIds);
    } catch (error) {
      next(error);
    }
  };

  getCount = async (
    req: GetCountReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const count = await wishlistService.getWishlistCount(userId);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  };

  getPaginated = async (
    req: GetPaginatedReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const {
        page = "1",
        limit = "50",
        sortBy = "addedAt",
        sortOrder = "desc",
      } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 100); // ограничим 100
      const result = await wishlistService.getWishlistPaginated(userId, {
        page: pageNum,
        limit: limitNum,
        sortBy: sortBy as "addedAt" | "price" | "name" | "popularity",
        sortOrder: sortOrder as "asc" | "desc",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new WishlistController();
