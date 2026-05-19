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
  mainImage: string | null;
  images: Array<{ url: string; alt?: string; order?: number }> | null;
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

    const cart = await CartModel.findByUser(userId);
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
      const product = item.product as unknown as
        | (IProduct & { finalPriceForIndividual?: number })
        | null;

      if (
        !product?.isVisible ||
        !["available", "preorder"].includes(product.status)
      ) {
        itemsToUpdate = true;
        continue;
      }

      let quantity = item.quantity;

      if (product.minOrderQuantity && quantity < product.minOrderQuantity) {
        validationIssues.push({
          productId: product._id as Types.ObjectId,
          productTitle: product.title,
          currentQuantity: quantity,
          minOrderQuantity: product.minOrderQuantity,
          message: `Минимальное количество для заказа: ${product.minOrderQuantity}`,
        });
        isCartValid = false;
      }

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

      let mainImage: string | null = null;
      if (product.images && product.images.length > 0) {
        const firstImage = [...product.images].sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        )[0];
        if (firstImage?.url) {
          mainImage = fileService.getFileUrl(firstImage.url);
        }
      }

      let processedImages: Array<{
        url: string;
        alt?: string;
        order?: number;
      }> | null = null;
      if (product.images && Array.isArray(product.images)) {
        processedImages = product.images
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((img) => {
            if (img?.url) {
              return { ...img, url: fileService.getFileUrl(img.url) };
            }
            return img;
          });
      }

      const productResponse: CartItemProduct = {
        _id: product._id as Types.ObjectId,
        title: product.title,
        sku: product.sku,
        price,
        url: (product as any).url ?? null,
        finalPrice,
        minOrderQuantity: product.minOrderQuantity || 1,
        maxOrderQuantity: product.maxOrderQuantity,
        mainImage,
        images: processedImages,
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

    if (itemsToUpdate) {
      cart.items = processedItems.map((i) => ({
        product: i.product._id,
        quantity: i.quantity,
        addedAt: i.addedAt,
      }));
      await cart.save();
    }

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
    if (!userId || !productId || quantity < 1) {
      throw ApiError.BadRequest("Некорректные данные");
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Товар не найден");
    }

    if (
      !product.isVisible ||
      !["available", "preorder"].includes(product.status)
    ) {
      throw ApiError.BadRequest("Товар недоступен для заказа");
    }

    if (product.maxOrderQuantity && quantity > product.maxOrderQuantity) {
      throw ApiError.BadRequest(
        `Максимальное количество для заказа: ${product.maxOrderQuantity}`,
      );
    }

    let cart = await CartModel.findOne({ user: userId });
    if (!cart) {
      cart = new CartModel({ user: userId, items: [] });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString(),
    );

    if (itemIndex === -1) {
      cart.items.push({
        product: productId as Types.ObjectId,
        quantity,
        addedAt: new Date(),
      });
    } else {
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].addedAt = new Date();
    }

    await cart.save();
    return this.getCart(userId);
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
  ): Promise<{ message: string; cartId: Types.ObjectId }> {
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
      cartId: cart._id,
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
