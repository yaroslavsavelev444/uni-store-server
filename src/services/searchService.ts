// services/SearchService.ts
import type { Types } from "mongoose";
import { ProductModel, UserSearchModel } from "../models/index.models.js";
import type { IProduct, ProductDocument } from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";

// Тип для документа истории поиска (если нет в типах, определяем локально)
interface IUserSearch {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  selectedProductId: Types.ObjectId;
  updatedAt: Date;
  createdAt: Date;
}

interface SearchHintResult {
  value: string;
  label: string;
  sku: string;
  price: number;
  originalPrice: number | null;
  hasDiscount: boolean;
  image?: string;
  category?: string;
  isPreorder: boolean;
  raw: IProduct;
}

class SearchService {
  /**
   * Сохранить или обновить запись в истории поиска
   */
  async saveSearchHistory(
    userId: string,
    productId: string,
  ): Promise<IUserSearch> {
    if (!userId) throw new Error("userId is required");
    if (!productId) throw new Error("productId is required");

    try {
      const record = await UserSearchModel.findOneAndUpdate(
        { userId, selectedProductId: productId },
        { $currentDate: { updatedAt: true } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      return record.toObject() as IUserSearch;
    } catch (err) {
      console.error("[saveSearchHistory] error:", err);
      throw err;
    }
  }

  /**
   * Получить историю поиска пользователя (последние 15, сортировка по updatedAt DESC)
   */
  async getSearchHistory(userId: string): Promise<any[]> {
    try {
      const history = await UserSearchModel.find({ userId })
        .populate<{
          selectedProductId: ProductDocument;
        }>("selectedProductId", "title sku")
        .sort({ updatedAt: -1 })
        .limit(15);
      return history;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Очистить всю историю поиска пользователя
   */
  async clearSearchHistory(userId: string): Promise<{ deletedCount?: number }> {
    try {
      return await UserSearchModel.deleteMany({ userId });
    } catch (err) {
      throw err;
    }
  }

  /**
   * Получение подсказок для поиска (hints)
   */
  async getHints(query: string): Promise<SearchHintResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const escapeRegex = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const sanitizedQuery = query.trim();
    const escapedQuery = escapeRegex(sanitizedQuery);
    const isPossibleSku = /^[a-zA-Z0-9_-]+$/.test(sanitizedQuery);

    // Используем IProduct + lean() совместимый тип
    let results: IProduct[] = [];

    try {
      // Приоритетный поиск по SKU
      if (isPossibleSku) {
        results = await ProductModel.find({
          $or: [
            { sku: sanitizedQuery },
            { sku: new RegExp(`^${escapedQuery}`, "i") },
          ],
          status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
          isVisible: true,
        })
          .select(
            "title sku mainImage priceForIndividual discount status category",
          )
          .populate("category", "name slug")
          .limit(10)
          .lean();
      }

      // Полнотекстовый поиск
      if (results.length === 0) {
        results = await ProductModel.find(
          {
            $text: { $search: sanitizedQuery },
            status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
            isVisible: true,
          },
          { score: { $meta: "textScore" } },
        )
          .sort({ score: { $meta: "textScore" }, title: 1 })
          .select(
            "title sku mainImage priceForIndividual discount status category",
          )
          .populate("category", "name slug")
          .limit(10)
          .lean();
      }

      // Fallback regex поиск
      if (results.length === 0) {
        results = await ProductModel.find({
          $or: [
            { title: new RegExp(escapedQuery, "i") },
            { description: new RegExp(escapedQuery, "i") },
            { manufacturer: new RegExp(escapedQuery, "i") },
            { keywords: new RegExp(escapedQuery, "i") },
          ],
          status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
          isVisible: true,
        })
          .select(
            "title sku mainImage priceForIndividual discount status category",
          )
          .populate("category", "name slug")
          .limit(10)
          .lean();
      }

      // Форматирование результатов
      const formattedResults: SearchHintResult[] = results.map((product) => {
        let finalPrice = product.priceForIndividual;

        if (product.discount?.isActive) {
          const now = new Date();
          const validFrom = product.discount.validFrom
            ? new Date(product.discount.validFrom)
            : new Date(0);
          const validUntil = product.discount.validUntil
            ? new Date(product.discount.validUntil)
            : new Date("9999-12-31");

          if (now >= validFrom && now <= validUntil) {
            if (
              product.discount.percentage &&
              product.discount.percentage > 0
            ) {
              finalPrice *= 1 - product.discount.percentage / 100;
            }
            if (product.discount.amount && product.discount.amount > 0) {
              finalPrice = Math.max(0, finalPrice - product.discount.amount);
            }
            finalPrice = Math.round(finalPrice * 100) / 100;
          }
        }

        const isPreorder = product.status === ProductStatus.PREORDER;

        return {
          value: product._id.toString(),
          label: product.title,
          sku: product.sku,
          price: finalPrice,
          originalPrice: product.discount?.isActive
            ? product.priceForIndividual
            : null,
          hasDiscount: !!product.discount?.isActive,
          image: product.mainImage,
          //@ts-expect-error
          category: product.category?.name || undefined,
          isPreorder,
          raw: product,
        };
      });

      console.log(
        `[SearchService] getHints: query="${query}" results=${formattedResults.length}`,
      );

      return formattedResults;
    } catch (err) {
      console.error(
        `[SearchService] getHints error: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}

export default new SearchService();
