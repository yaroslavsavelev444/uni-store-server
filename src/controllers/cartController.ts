// cart.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import cartService from "../services/cartService.js";
import type {
  AddOrUpdateItemReq,
  ClearCartReq,
  DecreaseQuantityReq,
  GetCartReq,
  RemoveItemReq,
  SuccessResponse,
} from "../types/controllers/cart-controller.js";

/**
 * Контроллер корзины.
 * Все методы требуют авторизации (req.user.id гарантирован).
 */
class CartController {
  /**
   * Получить текущую корзину пользователя.
   */
  getCart = async (
    req: GetCartReq,
    res: Response<
      SuccessResponse<Awaited<ReturnType<typeof cartService.getCart>>>
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const cart = await cartService.getCart(req.user.id);
      res.json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Добавить или обновить товар в корзине.
   */
  addOrUpdateItem = async (
    req: AddOrUpdateItemReq,
    res: Response<
      SuccessResponse<Awaited<ReturnType<typeof cartService.getCart>>>
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId, quantity } = req.body;

      if (!productId || typeof quantity !== "number" || quantity < 1) {
        throw ApiError.BadRequest(
          "Некорректные данные: productId и quantity > 0 обязательны",
        );
      }

      const cart = await cartService.addOrUpdateItem(
        req.user.id,
        productId,
        quantity,
      );
      res.status(200).json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удалить товар из корзины.
   */
  removeItem = async (
    req: RemoveItemReq,
    res: Response<
      SuccessResponse<Awaited<ReturnType<typeof cartService.getCart>>>
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId } = req.params;
      if (!productId) {
        throw ApiError.BadRequest("Не передан ID товара");
      }

      const cart = await cartService.removeItem(req.user.id, productId);
      res.status(200).json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Уменьшить количество товара в корзине на 1.
   */
  decreaseQuantity = async (
    req: DecreaseQuantityReq,
    res: Response<
      SuccessResponse<Awaited<ReturnType<typeof cartService.getCart>>>
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { productId } = req.params;
      if (!productId) {
        throw ApiError.BadRequest("Не передан ID товара");
      }

      const cart = await cartService.decreaseQuantity(req.user.id, productId);
      res.status(200).json({ success: true, data: cart });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Полностью очистить корзину.
   */
  clearCart = async (
    req: ClearCartReq,
    res: Response<SuccessResponse<{ message: string; cartId: string }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await cartService.clearCart(req.user.id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}

export default new CartController();
