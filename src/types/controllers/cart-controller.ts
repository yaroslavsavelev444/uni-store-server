// types/cart-controller.ts

import type {
  CartResponse,
  EmptyCartResponse,
} from "../../services/cartService.js";
import type { AuthRequest } from "../auth.js"; // предполагаемый путь

// Общий формат успешного ответа
export interface SuccessResponse<T> {
  success: true;
  data: T;
}

// Параметры маршрута для операций с конкретным товаром
export interface ProductIdParam {
  productId: string;
}

// Тело запроса для добавления/обновления товара
export interface AddOrUpdateItemBody {
  productId: string;
  quantity: number;
}

// Типизированные запросы
export type GetCartReq = AuthRequest<
  {},
  SuccessResponse<CartResponse | EmptyCartResponse>,
  {},
  {}
>;
export type AddOrUpdateItemReq = AuthRequest<
  {},
  SuccessResponse<CartResponse | EmptyCartResponse>,
  AddOrUpdateItemBody,
  {}
>;
export type RemoveItemReq = AuthRequest<
  ProductIdParam,
  SuccessResponse<CartResponse | EmptyCartResponse>,
  {},
  {}
>;
export type DecreaseQuantityReq = AuthRequest<
  ProductIdParam,
  SuccessResponse<CartResponse | EmptyCartResponse>,
  {},
  {}
>;
export type ClearCartReq = AuthRequest<
  {},
  SuccessResponse<{ message: string; cartId: string }>,
  {},
  {}
>;
