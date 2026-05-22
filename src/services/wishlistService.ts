// services/WishlistService.ts
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { ProductModel, WishlistModel } from "../models/index.models.js";
import type { IProduct } from "../types/product.types.js";
import type {
  IWishlistItem,
  WishlistDocument,
} from "../types/wishlist.types.js";

// ========== Локальные типы ==========
// Тип для товара после populate (в избранном)
type PopulatedWishlistItem = IWishlistItem & {
  product: IProduct;
};

type PopulatedWishlist = Omit<WishlistDocument, "items"> & {
  items: PopulatedWishlistItem[];
};

// Тип для ответа (продукт с дополнительными полями из избранного)
interface WishlistProduct extends IProduct {
  addedToWishlistAt: Date;
  wishlistNotes: string;
  finalPriceForIndividual: number;
}

interface WishlistSummary {
  totalItems: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalPreorder: number;
  hasPriceDrops: boolean;
  totalPrice: number;
  totalDiscount: number;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: "addedAt" | "price" | "name" | "popularity";
  sortOrder?: "asc" | "desc";
}

interface PaginatedWishlistResult {
  products: WishlistProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class WishlistService {
  private calculateFinalPrice(product: IProduct): number {
    if (!product.discount?.isActive) return product.priceForIndividual;
    const discount = product.discount;
    const now = new Date();
    if (discount.validFrom && now < new Date(discount.validFrom))
      return product.priceForIndividual;
    if (discount.validUntil && now > new Date(discount.validUntil))
      return product.priceForIndividual;
    let finalPrice = product.priceForIndividual;
    if (discount.percentage && discount.percentage > 0) {
      finalPrice *= 1 - discount.percentage / 100;
    }
    if (discount.amount && discount.amount > 0) {
      finalPrice = Math.max(0, finalPrice - discount.amount);
    }
    return Math.round(finalPrice * 100) / 100;
  }

  private getSortOptions(
    sortBy: PaginationOptions["sortBy"],
    sortOrder: "asc" | "desc",
  ): Record<string, 1 | -1> {
    const order = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "price":
        return { priceForIndividual: order };
      case "name":
        return { title: order };
      case "addedAt":
        return { addedToWishlistAt: order };
      case "popularity":
        return { viewsCount: order };
      default:
        return { addedToWishlistAt: -1 };
    }
  }

  private async getPopulatedWishlist(
    userId: string | Types.ObjectId,
  ): Promise<PopulatedWishlist | null> {
    const wishlist = await WishlistModel.findOne({ user: userId })
      .populate<{
        items: PopulatedWishlistItem[];
      }>({
        path: "items.product",
        select:
          "title sku priceForIndividual discount minOrderQuantity maxOrderQuantity status isVisible mainImage manufacturer category specifications weight warrantyMonths viewsCount purchasesCount",
        populate: {
          path: "category",
          select: "name slug",
        },
      })
      .lean();
    return wishlist as PopulatedWishlist | null;
  }

  async getWishlist(
    userId: string | Types.ObjectId,
  ): Promise<WishlistProduct[]> {
    if (!userId) throw ApiError.BadRequest("ID пользователя обязателен");

    const wishlist = await this.getPopulatedWishlist(userId);
    if (!wishlist || wishlist.items.length === 0) return [];

    const productsWithAddedAt = wishlist.items
      .filter((item) => item.product && item.product.isVisible)
      .map((item) => ({
        ...item.product,
        addedToWishlistAt: item.addedAt,
        wishlistNotes: item.notes || "",
        finalPriceForIndividual: this.calculateFinalPrice(item.product),
      }));

    productsWithAddedAt.sort(
      (a, b) =>
        new Date(b.addedToWishlistAt).getTime() -
        new Date(a.addedToWishlistAt).getTime(),
    );
    return productsWithAddedAt;
  }

  async addProduct(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
    notes = "",
  ): Promise<WishlistProduct[]> {
    if (!userId || !productId)
      throw ApiError.BadRequest("ID пользователя и товара обязательны");

    const product = await ProductModel.findById(productId);
    if (!product) throw ApiError.NotFoundError("Товар не найден");
    if (!product.isVisible)
      throw ApiError.BadRequest("Товар недоступен для добавления в избранное");

    let wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) {
      wishlist = new WishlistModel({
        user: userId,
        items: [],
        settings: {
          notifyOnPriceDrop: true,
          notifyOnRestock: true,
          sortBy: "addedAt",
        },
      });
    }

    const existingItem = wishlist.items.find(
      (item) => item.product.toString() === productId.toString(),
    );
    if (existingItem) {
      if (notes && notes !== existingItem.notes) {
        existingItem.notes = notes;
        existingItem.addedAt = new Date();
        await wishlist.save();
      }
      return this.getWishlist(userId);
    }

    wishlist.items.push({
      product: new Types.ObjectId(productId.toString()),
      addedAt: new Date(),
      notes,
    });
    await wishlist.save();
    return this.getWishlist(userId);
  }

  async removeProduct(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<WishlistProduct[]> {
    if (!userId || !productId)
      throw ApiError.BadRequest("ID пользователя и товара обязательны");

    const wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) throw ApiError.NotFoundError("Избранное не найдено");

    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(
      (item) => item.product.toString() !== productId.toString(),
    );
    if (wishlist.items.length === initialLength)
      throw ApiError.NotFoundError("Товар не найден в избранном");

    await wishlist.save();
    return this.getWishlist(userId);
  }

  async toggleProduct(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
    notes = "",
  ): Promise<WishlistProduct[]> {
    const wishlist = await WishlistModel.findOne({ user: userId });
    const exists = wishlist?.items.some(
      (item) => item.product.toString() === productId.toString(),
    );
    if (exists) {
      return this.removeProduct(userId, productId);
    } else {
      return this.addProduct(userId, productId, notes);
    }
  }

  async clearWishlist(userId: string | Types.ObjectId): Promise<[]> {
    if (!userId) throw ApiError.BadRequest("ID пользователя обязателен");

    const wishlist = await WishlistModel.findOne({ user: userId });
    if (!wishlist) throw ApiError.NotFoundError("Избранное не найдено");

    wishlist.items = [];
    await wishlist.save();
    return [];
  }

  async getWishlistSummary(
    userId: string | Types.ObjectId,
  ): Promise<WishlistSummary> {
    const wishlistProducts = await this.getWishlist(userId);
    const summary: WishlistSummary = {
      totalItems: wishlistProducts.length,
      totalAvailable: 0,
      totalUnavailable: 0,
      totalPreorder: 0,
      hasPriceDrops: false,
      totalPrice: 0,
      totalDiscount: 0,
    };

    for (const prod of wishlistProducts) {
      const isAvailable = prod.status === "available";
      const isPreorder = prod.status === "preorder";
      if (isAvailable) summary.totalAvailable++;
      if (isPreorder) summary.totalPreorder++;
      if (!isAvailable && !isPreorder) summary.totalUnavailable++;

      summary.totalPrice +=
        prod.finalPriceForIndividual || prod.priceForIndividual;

      if (prod.discount?.isActive) {
        summary.hasPriceDrops = true;
        const discountAmount =
          prod.priceForIndividual -
          (prod.finalPriceForIndividual || prod.priceForIndividual);
        summary.totalDiscount += discountAmount;
      }
    }
    return summary;
  }

  async isInWishlist(
    userId: string | Types.ObjectId,
    productId: string | Types.ObjectId,
  ): Promise<boolean> {
    if (!userId || !productId) return false;
    const wishlist = await WishlistModel.findOne({
      user: userId,
      "items.product": productId,
    }).select("items.product");
    return !!wishlist;
  }

  async getWishlistProductIds(
    userId: string | Types.ObjectId,
  ): Promise<string[]> {
    if (!userId) return [];
    const wishlist = await WishlistModel.findOne({ user: userId })
      .select("items.product")
      .lean();
    if (!wishlist?.items) return [];
    return wishlist.items
      .filter((item) => item.product)
      .map((item) => item.product.toString());
  }

  async getWishlistCount(userId: string | Types.ObjectId): Promise<number> {
    if (!userId) return 0;
    const wishlist = await WishlistModel.findOne({ user: userId })
      .select("items")
      .lean();
    return wishlist?.items?.length || 0;
  }

  async getWishlistPaginated(
    userId: string | Types.ObjectId,
    options: PaginationOptions = {},
  ): Promise<PaginatedWishlistResult> {
    if (!userId) {
      return {
        products: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const {
      page = 1,
      limit = 50,
      sortBy = "addedAt",
      sortOrder = "desc",
    } = options;

    const wishlist = await this.getPopulatedWishlist(userId);
    if (!wishlist || wishlist.items.length === 0) {
      return {
        products: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          pages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const productIds = wishlist.items
      .filter((item) => item.product && item.product.isVisible)
      .map((item) => item.product._id);
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      ProductModel.find({ _id: { $in: productIds }, isVisible: true })
        .select("-__v -createdBy -updatedBy -priceHistory -customAttributes")
        .populate("category", "name slug")
        .sort(
          this.getSortOptions(sortBy as PaginationOptions["sortBy"], sortOrder),
        )
        .skip(skip)
        .limit(Number(limit))
        .lean({ virtuals: true }),
      ProductModel.countDocuments({
        _id: { $in: productIds },
        isVisible: true,
      }),
    ]);

    const productsWithAddedAt = products.map((product) => {
      const wishlistItem = wishlist.items.find(
        (item) => item.product._id.toString() === product._id.toString(),
      );
      return {
        ...product,
        finalPriceForIndividual: this.calculateFinalPrice(product as IProduct),
        addedToWishlistAt: wishlistItem?.addedAt || new Date(),
        wishlistNotes: wishlistItem?.notes || "",
      } as WishlistProduct;
    });

    return {
      products: productsWithAddedAt,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export default new WishlistService();
