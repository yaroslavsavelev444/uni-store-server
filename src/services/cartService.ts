// services/CartService.ts
import type { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { CartModel, ProductModel } from "../models/index.models.js";
import type { ICartData } from "../types/discount.types.js";
import type { IProduct, ProductDocument } from "../types/product.types.js";
import fileService from "../utils/fileManager.js";
import discountService from "./discountService.js";

// ========== Типы для ответов ==========
interface CartItemProduct {
  _id: Types.ObjectId;
  title: string;
  sku: string;
  price: number;
  url?: string | null;
  finalPrice: number;
  minOrderQuantity: number;
  maxOrderQuantity?: number;
  image: string;
  status: string;
  weight: number;
  dimensions?: IProduct["dimensions"];
  brand?: string;
  category?: Types.ObjectId;
  description?: string;
}

interface CartItemResponse {
  product: CartItemProduct;
  quantity: number;
  addedAt: Date;
  subtotal: number;
  discount: number;
}

interface CartSummary {
  totalItems: number;
  totalPrice: number;
  totalDiscount: number;
  itemsCount: number;
  priceWithoutDiscount: number;
  productDiscountAmount: number;
  centralDiscountAmount: number;
  centralDiscountPercent: number;
}

interface CartValidation {
  isValid: boolean;
  issues: Array<{
    productId: Types.ObjectId;
    productTitle: string;
    currentQuantity: number;
    minOrderQuantity: number;
    message: string;
  }>;
}

interface AppliedDiscount {
  _id: Types.ObjectId;
  name: string;
  type: string;
  discountPercent: number;
  amount: number;
  message: string;
}

interface DiscountHint {
  type: "hint";
  message: string;
  needed: number;
  current: number;
}

interface CartDiscounts {
  applied: AppliedDiscount[];
  available: unknown[];
  hints: DiscountHint[];
}

export interface CartResponse {
  items: CartItemResponse[];
  summary: CartSummary;
  validation: CartValidation;
  discounts: CartDiscounts;
  cartId: Types.ObjectId;
  updatedAt: Date;
}

export interface EmptyCartResponse {
  items: [];
  summary: Omit<CartSummary, "productDiscountAmount"> & {
    productDiscountAmount: 0;
  };
  validation: { isValid: true; issues: [] };
  discounts: { applied: []; available: []; hints: [] };
}

// ========== Сервис ==========
class CartService {
  private roundMoney(amount: number): number {
    return Math.round(amount * 100) / 100;
  }

  private getEmptyCartResponse(): EmptyCartResponse {
    return {
      items: [],
      summary: {
        totalItems: 0,
        totalPrice: 0,
        totalDiscount: 0,
        itemsCount: 0,
        priceWithoutDiscount: 0,
        productDiscountAmount: 0,
        centralDiscountAmount: 0,
        centralDiscountPercent: 0,
      },
      validation: { isValid: true, issues: [] },
      discounts: { applied: [], available: [], hints: [] },
    };
  }

  async getCart(
    userId: string | Types.ObjectId,
  ): Promise<CartResponse | EmptyCartResponse> {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    // 1. Запрашиваем корзину с кастомным populate для товаров и ТОЛЬКО первого изображения
    const cart = await CartModel.findOne({ user: userId })
      .populate({
        path: "items.product",
        populate: {
          path: "images",
          options: {
            sort: { order: 1 }, // сортируем по полю order (по возрастанию)
            perDocumentLimit: 1, // загружаем только первый документ
          },
          select: "url order", // выбираем только нужные поля
        },
      })
      .lean(); // используем lean() для производительности (если не нужны методы Mongoose)

    if (!cart) {
      return this.getEmptyCartResponse();
    }

    const processedItems: CartItemResponse[] = [];
    let totalPrice = 0;
    let totalPriceWithoutDiscount = 0;
    let itemsToUpdate = false;
    const validationIssues: CartValidation["issues"] = [];
    let isCartValid = true;

    for (const item of cart.items) {
      const product = item.product as any; // product уже содержит images (массив из 0 или 1 элемента)

      // Проверка видимости и статуса товара
      if (
        !product?.isVisible ||
        !["available", "preorder"].includes(product.status)
      ) {
        itemsToUpdate = true;
        continue;
      }

      let quantity = item.quantity;

      // Валидация минимального количества
      if (product.minOrderQuantity && quantity < product.minOrderQuantity) {
        validationIssues.push({
          productId: product._id,
          productTitle: product.title,
          currentQuantity: quantity,
          minOrderQuantity: product.minOrderQuantity,
          message: `Минимальное количество для заказа: ${product.minOrderQuantity}`,
        });
        isCartValid = false;
      }

      // Корректировка по максимальному количеству
      if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
        quantity = product.maxOrderQuantity;
        itemsToUpdate = true;
      }

      const price = product.priceForIndividual || 0;
      const finalPrice =
        product.finalPriceForIndividual !== undefined &&
        product.finalPriceForIndividual !== null
          ? product.finalPriceForIndividual
          : price;

      const itemTotal = this.roundMoney(price * quantity);
      const itemTotalWithDiscount = this.roundMoney(finalPrice * quantity);
      const itemDiscount = this.roundMoney(itemTotal - itemTotalWithDiscount);

      totalPriceWithoutDiscount = this.roundMoney(
        totalPriceWithoutDiscount + itemTotal,
      );
      totalPrice = this.roundMoney(totalPrice + itemTotalWithDiscount);

      // ----- НОВАЯ ЛОГИКА ФОРМИРОВАНИЯ ИЗОБРАЖЕНИЯ -----
      let image: string | null = null;
      if (product.images && product.images.length > 0) {
        // product.images уже содержит только первый элемент (благодаря perDocumentLimit: 1)
        const firstImage = product.images[0];
        if (firstImage?.url) {
          image = fileService.getFileUrl(firstImage.url);
        }
      }
      // -------------------------------------------------

      const productResponse: CartItemProduct = {
        _id: product._id,
        title: product.title,
        sku: product.sku,
        price,
        url: (product as any).url ?? null,
        finalPrice,
        minOrderQuantity: product.minOrderQuantity || 1,
        maxOrderQuantity: product.maxOrderQuantity,
        image: image || "", // новое поле вместо mainImage и images
        status: product.status,
        weight: product.weight || 0,
        dimensions: product.dimensions,
        brand: (product as any).brand,
        category: product.category,
        description: product.description,
      };

      processedItems.push({
        product: productResponse,
        quantity,
        addedAt: item.addedAt,
        subtotal: itemTotalWithDiscount,
        discount: itemDiscount,
      });
    }

    // 2. Обновляем корзину, если были изменения количеств или удалены невидимые товары
    if (itemsToUpdate) {
      cart.items = processedItems.map((i) => ({
        product: i.product._id,
        quantity: i.quantity,
        addedAt: i.addedAt,
      }));
      await CartModel.updateOne({ _id: cart._id }, { items: cart.items });
    }

    // 3. Расчёт центральных скидок (как было раньше)
    const cartDataForDiscounts = {
      items: processedItems.map((i) => ({
        productId: i.product._id,
        quantity: i.quantity,
        price: i.product.price,
        finalPrice: i.product.finalPrice,
      })),
      totalAmount: totalPrice,
      totalQuantity: processedItems.reduce((sum, i) => sum + i.quantity, 0),
    };

    const discountResult =
      await discountService.getApplicableDiscounts(cartDataForDiscounts);
    const appliedDiscount = discountResult.find((d: any) => d.applicable);
    const centralDiscountAmount = appliedDiscount
      ? this.roundMoney(appliedDiscount.discountAmount)
      : 0;

    const finalTotalPrice = this.roundMoney(totalPrice - centralDiscountAmount);
    const totalDiscount = this.roundMoney(
      totalPriceWithoutDiscount - totalPrice + centralDiscountAmount,
    );

    // 4. Формируем итоговый ответ
    return {
      items: processedItems,
      summary: {
        totalItems: processedItems.reduce((sum, i) => sum + i.quantity, 0),
        totalPrice: finalTotalPrice,
        totalDiscount,
        itemsCount: processedItems.length,
        priceWithoutDiscount: totalPriceWithoutDiscount,
        productDiscountAmount: this.roundMoney(
          totalPriceWithoutDiscount - totalPrice,
        ),
        centralDiscountAmount,
        centralDiscountPercent: appliedDiscount?.discount?.discountPercent ?? 0,
      },
      validation: { isValid: isCartValid, issues: validationIssues },
      discounts: {
        applied: appliedDiscount
          ? [
              {
                _id: appliedDiscount.discount._id,
                name: appliedDiscount.discount.name,
                type: appliedDiscount.discount.type,
                discountPercent: appliedDiscount.discount.discountPercent,
                amount: centralDiscountAmount,
                message: appliedDiscount.message,
              },
            ]
          : [],
        available: [],
        hints: discountResult
          .filter((d: any) => !d.applicable)
          .map((d: any) => ({
            type: "hint" as const,
            message: d.message,
            needed: d.needed,
            current: d.current,
          })),
      },
      cartId: cart._id,
      updatedAt: cart.updatedAt,
    };
  }
  async addOrUpdateItem(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
    quantity: number,
  ): Promise<CartResponse | EmptyCartResponse> {
    console.log(
      `[addOrUpdateItem] Called with userId=${userId}, productId=${productId}, quantity=${quantity}`,
    );

    if (!userId || !productId || quantity < 1) {
      console.log(
        `[addOrUpdateItem] Validation failed: userId=${!!userId}, productId=${!!productId}, quantity=${quantity}`,
      );
      throw ApiError.BadRequest("Некорректные данные");
    }

    console.log(`[addOrUpdateItem] Fetching product ${productId}...`);
    const product = await ProductModel.findById(productId);
    if (!product) {
      console.log(`[addOrUpdateItem] Product ${productId} not found`);
      throw ApiError.NotFoundError("Товар не найден");
    }
    console.log(
      `[addOrUpdateItem] Product found: name=${product.title}, status=${product.status}, isVisible=${product.isVisible}`,
    );

    if (
      !product.isVisible ||
      !["available", "preorder"].includes(product.status)
    ) {
      console.log(
        `[addOrUpdateItem] Product unavailable: isVisible=${product.isVisible}, status=${product.status}`,
      );
      throw ApiError.BadRequest("Товар недоступен для заказа");
    }

    if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
      console.log(
        `[addOrUpdateItem] Quantity ${quantity} exceeds maxOrderQuantity ${product.maxOrderQuantity}`,
      );
      throw ApiError.BadRequest(
        `Максимальное количество для заказа: ${product.maxOrderQuantity}`,
      );
    }

    console.log(`[addOrUpdateItem] Looking for cart of user ${userId}...`);
    let cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      console.log(
        `[addOrUpdateItem] Cart not found, creating new cart for user ${userId}`,
      );
      cart = new CartModel({ user: userId, items: [] });
    } else {
      console.log(
        `[addOrUpdateItem] Cart found, items count = ${cart.items.length}`,
      );
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString(),
    );
    console.log(`[addOrUpdateItem] Item index in cart = ${itemIndex}`);

    if (itemIndex === -1) {
      console.log(
        `[addOrUpdateItem] Adding new product ${productId} with quantity ${quantity}`,
      );
      cart.items.push({
        product: productId as Types.ObjectId,
        quantity,
        addedAt: new Date(),
      });
    } else {
      console.log(
        `[addOrUpdateItem] Updating existing product ${productId} from quantity ${cart.items[itemIndex].quantity} to ${quantity}`,
      );
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].addedAt = new Date();
    }

    console.log(`[addOrUpdateItem] Saving cart...`);
    await cart.save();
    console.log(`[addOrUpdateItem] Cart saved successfully`);

    console.log(
      `[addOrUpdateItem] Fetching updated cart via getCart(${userId})`,
    );
    const result = await this.getCart(userId);
    console.log(`[addOrUpdateItem] Returning result`);
    return result;
  }
  async removeItem(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<CartResponse | EmptyCartResponse> {
    if (!userId || !productId) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId.toString(),
    );

    if (cart.items.length === initialLength) {
      throw ApiError.NotFoundError("Товар не найден в корзине");
    }

    await cart.save();
    return this.getCart(userId);
  }

  async decreaseQuantity(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<CartResponse | EmptyCartResponse> {
    if (!userId || !productId) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString(),
    );
    if (itemIndex === -1) {
      throw ApiError.NotFoundError("Товар не найден в корзине");
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    const newQuantity = cart.items[itemIndex].quantity - 1;
    if (newQuantity < 1) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = newQuantity;
    }

    await cart.save();
    return this.getCart(userId);
  }

  async clearCart(
    userId: string | Types.ObjectId,
  ): Promise<{ message: string; cartId: string }> {
    if (!userId) {
      throw ApiError.BadRequest("ID пользователя обязателен");
    }

    const cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      throw ApiError.NotFoundError("Корзина не найдена");
    }

    cart.items = [];
    await cart.save();

    return {
      message: "Корзина очищена",
      cartId: cart._id.toString(),
    };
  }

  async getCartSummary(userId: string | Types.ObjectId): Promise<CartSummary> {
    const cart = await this.getCart(userId);
    return cart.summary;
  }

  async calculateCartDiscounts(cartData: ICartData): Promise<unknown> {
    return await discountService.getApplicableDiscounts(cartData);
  }
}

export default new CartService();
