//@ts-nocheck
// services/ProductService.ts
/** biome-ignore-all lint/suspicious/noImplicitAnyLet: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
/** biome-ignore-all lint/complexity/useOptionalChain: <explanation> */
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { CategoryModel, ProductModel } from "../models/index.models.js";
import type { CreateProductBody } from "../types/controllers/product-controller.js";
import type {
  IProduct,
  ProductDocument,
  ProductStatusType,
} from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";
import fileManager from "../utils/fileManager.js";
import { normalizeProduct } from "../utils/normalizeProduct.js";
import categoryService from "./categoryService.js"; // нужно импортировать
import fileStorageService from "./fileStorage.service.js";
import ProductDiscountService from "./ProductDiscountService.js";
import purchaseCheckService from "./purchaseCheckService.js";
import { ReviewsService } from "./reviewService.js";

// Вспомогательные типы
interface ProductQueryParams {
  category?: string;
  status?: ProductStatusType;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  search?: string;
  slug?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  populate?: "none" | "relatedProducts" | "all";
  excludeIds?: string[];
  showOnMainPage?: boolean;
  manufacturer?: string;
  warrantyMonths?: number;
  isAdmin?: boolean;
}

interface PaginatedResult<T> {
  products: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface SimilarProductsOptions {
  limit?: number;
}

class ProductService {
  private async findCategoryById(id: string | Types.ObjectId) {
    return categoryService.getCategoryById(id);
  }

  private getSortField(sortBy: string): string {
    const sortMap: Record<string, string> = {
      price: "priceForIndividual",
      title: "title",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      popularity: "viewsCount",
    };
    return sortMap[sortBy] || "createdAt";
  }

  private calculateFinalPrice(product: IProduct): number {
    if (!product.discount?.isActive) return product.priceForIndividual;
    const now = new Date();
    const discount = product.discount;
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

  async getAllProducts(
    query: ProductQueryParams = {},
  ): Promise<PaginatedResult<any>> {
    const {
      category,
      status,
      minPrice,
      maxPrice,
      search,
      slug,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 50,
      populate = "none",
      excludeIds,
      showOnMainPage,
      manufacturer,
      warrantyMonths,
      isAdmin,
    } = query;

    const filter: any = {};

    // Фильтр по статусу и видимости
    if (isAdmin) {
      if (status && Object.values(ProductStatus).includes(status)) {
        filter.status = status;
      }
    } else {
      if (status && Object.values(ProductStatus).includes(status)) {
        filter.status = status;
      } else {
        filter.status = {
          $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER],
        };
      }
      filter.isVisible = true;
    }

    // Фильтр по категории (прямой ID)
    if (category) {
      if (!Types.ObjectId.isValid(category))
        throw ApiError.BadRequest("Некорректный ID категории");
      filter.category = category;
    }

    // ИСПРАВЛЕНО: поиск категории по slug через CategoryModel
    let categoryIdFromSlug: Types.ObjectId | null = null;
    if (slug) {
      try {
        const categoryDoc = await CategoryModel.findOne({ slug }).lean();
        if (!categoryDoc) {
          // возвращаем пустой результат, если категория не найдена
          return {
            products: [],
            pagination: {
              page,
              limit,
              total: 0,
              pages: 0,
              hasNext: false,
              hasPrev: false,
            },
          };
        }
        categoryIdFromSlug = categoryDoc._id;
        filter.category = categoryIdFromSlug;
      } catch (err) {
        console.error(
          `[getAllProducts] Ошибка при поиске категории по slug "${slug}":`,
          err,
        );
        throw ApiError.DatabaseError(
          `Ошибка при поиске категории по slug: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Фильтр по цене
    if (minPrice || maxPrice) {
      filter.priceForIndividual = {};
      if (minPrice) filter.priceForIndividual.$gte = minPrice;
      if (maxPrice) filter.priceForIndividual.$lte = maxPrice;
    }

    // Текстовый поиск
    if (search?.trim()) {
      filter.$text = { $search: search.trim() };
    }

    // Исключение ID
    if (excludeIds?.length) {
      const valid = excludeIds.filter((id) => Types.ObjectId.isValid(id));
      if (valid.length) filter._id = { $nin: valid };
    }

    // Дополнительные фильтры
    if (showOnMainPage) filter.showOnMainPage = true;
    if (manufacturer)
      filter.manufacturer = { $regex: manufacturer, $options: "i" };
    if (warrantyMonths) filter.warrantyMonths = { $gte: warrantyMonths };

    // Сортировка
    const sortOptions: any = {};
    const sortField = this.getSortField(sortBy);
    sortOptions[sortField] = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "popularity") sortOptions.title = 1;

    const skip = (page - 1) * limit;
    const limitNum = Number(limit);

    try {
      // Базовый запрос
      let queryBuilder = ProductModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .populate("category", "slug name _id")
        .limit(limitNum)
        .lean({ virtuals: true });

      // Опциональный populate связанных продуктов
      if (populate === "relatedProducts" || populate === "all") {
        const relatedFilter: any = {};
        if (!isAdmin) {
          relatedFilter.status = {
            $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER],
          };
          relatedFilter.isVisible = true;
        }
        queryBuilder = queryBuilder.populate({
          path: "relatedProducts",
          select: "title priceForIndividual status discount _id sku category",
          match: relatedFilter,
          options: { limit: 10 },
          populate: { path: "category", select: "slug name _id" },
        });
      }

      // Получение продуктов и общего количества
      const [products, total] = await Promise.all([
        queryBuilder,
        ProductModel.countDocuments(filter),
      ]);

      // Получение количества отзывов (с отдельной обработкой ошибок)
      let productsWithReviews;
      try {
        productsWithReviews = await Promise.all(
          (products as any[]).map(async (product) => {
            const reviewsCount =
              await ReviewsService.getProductReviewsCountStatic(product._id);
            return {
              ...product,
              finalPriceForIndividual: this.calculateFinalPrice(product),
              reviewsCount,
            };
          }),
        );
      } catch (err) {
        console.error(
          "[getAllProducts] Ошибка при получении отзывов для продуктов:",
          err,
        );
        throw ApiError.DatabaseError(
          `Ошибка при получении отзывов: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Получение скидок (ошибки не прерывают выполнение)
      let productsWithDiscounts = productsWithReviews;
      if (!(query as any).skipDiscountCheck) {
        try {
          productsWithDiscounts =
            await ProductDiscountService.getDiscountsForProducts(
              productsWithReviews,
            );
        } catch (err) {
          console.error(
            "[getAllProducts] Ошибка при получении скидок для продуктов:",
            err,
          );
          // продолжаем без скидок
        }
      }

      // Обработка URL и дополнительных полей (с защитой от ошибок в отдельных продуктах)
      const processedProducts = productsWithDiscounts.map((product: any) => {
        try {
          const processed = { ...product };
          // Обработка изображений
          if (Array.isArray(processed.images)) {
            processed.images = processed.images.map((img: any) => ({
              ...img,
              url: fileManager.getFileUrl(img.url),
            }));
          }
          // Обработка инструкции (файл)
          if (
            processed.instruction?.url &&
            !processed.instruction.url.startsWith("http")
          ) {
            processed.instruction.url = fileManager.getFileUrl(
              processed.instruction.url,
            );
          }
          // Центральные скидки
          if (processed.centralDiscounts?.length) {
            const mainDisc = processed.centralDiscounts[0];
            processed.hasCentralDiscount = true;
            processed.centralDiscountPercent = mainDisc.discountPercent;
            processed.discountMessage = mainDisc.message;
            if (mainDisc.type === "quantity_based") {
              processed.centralDiscountMinQuantity = mainDisc.minTotalQuantity;
              processed.discountType = "quantity_based";
            }
          }
          return processed;
        } catch (err) {
          console.error(
            `[getAllProducts] Ошибка обработки продукта ${product._id}:`,
            err,
          );
          // Возвращаем продукт без изменений, чтобы не ломать весь список
          return product;
        }
      });

      const normalizedProducts = processedProducts.map((product: any) =>
        normalizeProduct(product),
      );

      return {
        products: normalizedProducts,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
          hasNext: page * limitNum < total,
          hasPrev: page > 1,
        },
      };
    } catch (err) {
      // Полное логирование ошибки с контекстом
      console.error("[getAllProducts] КРИТИЧЕСКАЯ ОШИБКА:", err);
      console.error(
        "[getAllProducts] Параметры запроса:",
        JSON.stringify(query, null, 2),
      );
      console.error(
        "[getAllProducts] Фильтр MongoDB:",
        JSON.stringify(filter, null, 2),
      );

      throw ApiError.DatabaseError(
        `Ошибка при получении продуктов: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getSimilarProducts(
    productId: string,
    options: SimilarProductsOptions = {},
  ): Promise<any[]> {
    if (!Types.ObjectId.isValid(productId))
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    try {
      const currentProduct = await ProductModel.findById(productId)
        .select("category title priceForIndividual")
        .populate("category", "name slug")
        .lean();
      if (!currentProduct) throw ApiError.NotFoundError("Продукт не найден");
      const categoryId = (currentProduct.category as any)?._id;
      const limit = options.limit || 4;
      if (!categoryId) return [];

      const categoryResult = await this.getAllProducts({
        category: categoryId.toString(),
        excludeIds: [productId],
        limit,
        sortBy: "popularity",
        populate: "none",
      });
      let similarProducts = categoryResult.products;

      if (similarProducts.length < limit) {
        const remaining = limit - similarProducts.length;
        const excludeAllIds = [
          productId,
          ...similarProducts.map((p: any) => p._id.toString()),
        ];
        const priceResult = await this.getAllProducts({
          minPrice: currentProduct.priceForIndividual * 0.7,
          maxPrice: currentProduct.priceForIndividual * 1.3,
          excludeIds: excludeAllIds,
          limit: remaining,
          sortBy: "popularity",
          populate: "none",
        });
        similarProducts = [...similarProducts, ...priceResult.products];
      }
      return similarProducts.slice(0, limit);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при получении похожих продуктов");
    }
  }

  async getProductById(id: string, options: any = {}): Promise<any> {
    if (!Types.ObjectId.isValid(id))
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    try {
      let query = ProductModel.findById(id);
      if (options.populate === "category" || options.populate === "all") {
        query = query.populate("category", "name slug description _id");
      }
      if (
        options.populate === "relatedProducts" ||
        options.populate === "all"
      ) {
        query = query.populate(
          "relatedProducts",
          "title sku priceForIndividual status _id",
        );
      }
      const product = await query.lean({ virtuals: true });
      if (!product) throw ApiError.NotFoundError("Продукт не найден");
      if (!options.isAdmin && !(product as any).isVisible)
        throw ApiError.NotFoundError("Продукт не доступен");
      if ((product as any).category && !(product as any).category._id) {
        throw ApiError.NotFoundError("Категория продукта не найдена");
      }
      (product as any).finalPriceForIndividual = this.calculateFinalPrice(
        product as any,
      );
      return product;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при получении продукта");
    }
  }

  async getProductBySku(sku: string, options: any = {}): Promise<any> {
    try {
      let query = ProductModel.findOne({ sku });
      if (options.populate === "category" || options.populate === "all") {
        query = query.populate("category", "name slug description _id");
      }
      if (
        options.populate === "relatedProducts" ||
        options.populate === "all"
      ) {
        query = query.populate(
          "relatedProducts",
          "title sku priceForIndividual status _id",
        );
      }
      const product = await query.lean({ virtuals: true });
      if (!product) throw ApiError.NotFoundError("Продукт не найден");
      if (!options.isAdmin && !(product as any).isVisible)
        throw ApiError.NotFoundError("Продукт не доступен");
      if ((product as any).category && !(product as any).category._id) {
        throw ApiError.NotFoundError("Категория продукта не найдена");
      }
      if (Array.isArray((product as any).specifications)) {
        (product as any).specifications = (
          product as any
        ).specifications.filter((spec: any) => spec.isVisible !== false);
      }
      (product as any).finalPriceForIndividual = this.calculateFinalPrice(
        product as any,
      );
      if (Array.isArray((product as any).images)) {
        (product as any).images = (product as any).images.map((img: any) => ({
          ...img,
          url: fileManager.getFileUrl(img.url),
        }));
      }
      if (!options.skipDiscountCheck) {
        const discountInfo =
          await ProductDiscountService.getCartDiscountInfoForProduct(
            product as any,
            options.cartQuantity || 1,
          );
        if (discountInfo) {
          (product as any).cartDiscount = discountInfo;
          (product as any).hasCentralDiscount = discountInfo.hasDiscount;
          (product as any).centralDiscountPercent =
            discountInfo.discountPercent;
          (product as any).discountMessage = discountInfo.message;
        }
      }
      if (options.userId) {
        (product as any).hasPurchased =
          await purchaseCheckService.hasUserPurchasedProduct(
            options.userId,
            product._id.toString(),
          );
        (product as any).hasReviewed =
          await ReviewsService.checkIfUserHasReviewedStatic(
            options.userId,
            product._id.toString(),
          );
      }
      return product;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при получении продукта");
    }
  }

  private async processImagesForCreate(
    imageIds: string[] | undefined,
    _userId: string,
  ): Promise<string[]> {
    if (!imageIds?.length) return [];

    // Убираем только пустые/невалидные строки
    const validIds = imageIds.filter(
      (id) => typeof id === "string" && id.trim().length > 0,
    );

    if (validIds.length === 0) return [];

    // Проверяем существование через fileStorageService
    const existing = await fileStorageService.checkIfExists(validIds);
    const existingSet = new Set(Array.isArray(existing) ? existing : []);

    const missing = validIds.filter((id) => !existingSet.has(id));
    if (missing.length) {
      throw ApiError.BadRequest(`Файлы не найдены: ${missing.join(", ")}`);
    }

    console.log("✅ processImagesForCreate → passed IDs:", validIds); // дебажный лог
    return validIds;
  }

  /**
   * Обновление — с поддержкой removedImageIds
   */
  private async processImagesForUpdate(
    newImageIds: string[] | undefined,
    removedImageIds: string[],
    oldImageIds: string[],
    userId: string,
  ): Promise<string[]> {
    if (newImageIds === undefined) return oldImageIds;

    const finalIds = newImageIds.filter(
      (id) => typeof id === "string" && id.trim().length > 0,
    );

    // Удаляем файлы
    const idsToDelete = removedImageIds.filter((id) =>
      oldImageIds.includes(id),
    );
    if (idsToDelete.length > 0) {
      await fileStorageService.deleteFiles(idsToDelete, userId).catch((err) => {
        console.error("Ошибка удаления файлов:", err);
      });
    }

    // Проверка существования
    if (finalIds.length > 0) {
      const existing = await fileStorageService.checkIfExists(finalIds);
      const existingSet = new Set(Array.isArray(existing) ? existing : []);
      const missing = finalIds.filter((id) => !existingSet.has(id));

      if (missing.length) {
        throw ApiError.BadRequest(`Файлы не найдены: ${missing.join(", ")}`);
      }
    }

    console.log("✅ processImagesForUpdate → final IDs:", finalIds);
    return finalIds;
  }

  /**
   * Создание — обработка инструкции
   */
  private async processInstructionForCreate(
    instruction: any,
    _userId: string,
  ): Promise<any> {
    if (!instruction) return null;

    const { type, file, link } = instruction;

    if (type === "file") {
      if (!file)
        throw ApiError.BadRequest("Для типа 'file' требуется ID файла");

      const fileId = file.toString();
      const exists = await fileStorageService.checkIfExists([fileId]);

      if (!exists || !exists.includes(fileId)) {
        throw ApiError.BadRequest("Файл инструкции не найден");
      }

      return { type: "file", file: new Types.ObjectId(fileId) };
    }

    if (type === "link") {
      if (!link || typeof link !== "string") {
        throw ApiError.BadRequest("Для типа 'link' требуется ссылка");
      }

      try {
        new URL(link);
      } catch {
        throw ApiError.BadRequest("Некорректная ссылка");
      }

      return { type: "link", link };
    }

    throw ApiError.BadRequest("Некорректный тип инструкции");
  }

  /**
   * Обновление — обработка инструкции с поддержкой removedInstruction
   */
  private async processInstructionForUpdate(
    newInstruction: any,
    removedInstruction: boolean,
    oldInstruction: any | null,
    userId: string,
  ): Promise<any> {
    // Полное удаление инструкции
    if (removedInstruction === true || newInstruction === null) {
      if (oldInstruction?.type === "file" && oldInstruction.file) {
        await fileStorageService
          .deleteFiles([oldInstruction.file.toString()], userId)
          .catch(() => {});
      }
      return null;
    }

    // Инструкция не меняется
    if (newInstruction === undefined) {
      return oldInstruction;
    }

    // Новая инструкция
    const { type, file, link } = newInstruction;

    if (type === "file") {
      if (!file) throw ApiError.BadRequest("Для file нужен ID файла");

      const fileId = file.toString();
      const exists = await fileStorageService.checkIfExists([fileId]);

      if (!exists || !exists.includes(fileId)) {
        throw ApiError.BadRequest("Файл инструкции не найден");
      }

      // Удаляем старый файл, если он был и отличается
      if (
        oldInstruction?.type === "file" &&
        oldInstruction.file?.toString() !== fileId
      ) {
        await fileStorageService
          .deleteFiles([oldInstruction.file.toString()], userId)
          .catch(() => {});
      }

      return { type: "file", file: new Types.ObjectId(fileId) };
    }

    if (type === "link") {
      if (!link) throw ApiError.BadRequest("Для link нужна ссылка");

      try {
        new URL(link);
      } catch {
        throw ApiError.BadRequest("Некорректная ссылка");
      }

      if (oldInstruction?.type === "file" && oldInstruction.file) {
        await fileStorageService
          .deleteFiles([oldInstruction.file.toString()], userId)
          .catch(() => {});
      }

      return { type: "link", link };
    }

    throw ApiError.BadRequest("Некорректный тип инструкции");
  }

  async createProduct(
    productData: CreateProductBody,
    userId: string,
  ): Promise<any> {
    try {
      const existing = await ProductModel.findOne({ sku: productData.sku });
      if (existing)
        throw ApiError.BadRequest("Продукт с таким SKU уже существует");

      await this.findCategoryById(productData.category);
      await this.validateRelatedProducts(productData);

      const finalImages = await this.processImagesForCreate(
        productData.images || [],
        userId,
      );
      console.log("✅ After processImagesForCreate:", finalImages);

      const finalInstruction = await this.processInstructionForCreate(
        productData.instruction,
        userId,
      );

      const product = new ProductModel({
        ...productData,
        images: finalImages, // ← массив строк
        instruction: finalInstruction,
        createdBy: userId,
        updatedBy: userId,
      });

      await product.save();

      console.log("✅ Product created with images:", finalImages); // для дебага

      return this.formatProductForResponse(product);
    } catch (err) {
      await this.rollbackProductFiles(productData);
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка создания продукта");
    }
  }

  /**
   * Обновление продукта
   */
  /**
   * Обновление продукта
   */
  /**
   * Обновление продукта
   */
  async updateProduct(
    id: string,
    updateData: any,
    userId: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw ApiError.BadRequest("Некорректный ID продукта");
    }

    const product = await ProductModel.findById(id);
    if (!product) throw ApiError.NotFoundError("Продукт не найден");

    // Проверка SKU
    if (updateData.sku && updateData.sku !== product.sku) {
      const existing = await ProductModel.findOne({
        sku: updateData.sku,
        _id: { $ne: id },
      });
      if (existing) throw ApiError.BadRequest("SKU уже занят");
    }

    // Проверка категории и связанных товаров
    if (updateData.category) await this.findCategoryById(updateData.category);
    await this.validateRelatedProducts(updateData, id);

    // ========== Обработка изображений (без изменений) ==========
    if (
      updateData.images !== undefined ||
      updateData.removedImageIds !== undefined
    ) {
      const oldImageIds = (product.images as string[]).map((id) =>
        id.toString(),
      );
      const newImageIds = updateData.images || oldImageIds;
      const removedIds = updateData.removedImageIds || [];

      const processedImageIds = await this.processImagesForUpdate(
        newImageIds,
        removedIds,
        oldImageIds,
        userId,
      );

      product.images = processedImageIds.map((id) => id);
    }

    // ========== Обработка инструкции (без изменений) ==========
    if (
      updateData.instruction !== undefined ||
      updateData.removedInstruction === true
    ) {
      const oldInstruction = product.instruction || null;
      const processedInstruction = await this.processInstructionForUpdate(
        updateData.instruction,
        updateData.removedInstruction || false,
        oldInstruction,
        userId,
      );
      product.instruction = processedInstruction;
    }

    // ========== FIXED: Обновление простых полей + specifications ==========
    // Список полей, которые можно безопасно скопировать
    const simpleFields = [
      "sku",
      "title",
      "description",
      "priceForIndividual",
      "category",
      "status",
      "isVisible",
      "showOnMainPage",
      "weight",
      "dimensions",
      "manufacturer",
      "warrantyMonths",
      "minOrderQuantity",
      "maxOrderQuantity",
      "metaTitle",
      "metaDescription",
      "keywords",
      "customAttributes",
      "relatedProducts",
      "upsellProducts",
      "crossSellProducts",
    ];

    simpleFields.forEach((key) => {
      if (updateData[key] !== undefined) {
        (product as any)[key] = updateData[key];
      }
    });

    // FIXED: Обновление specifications – разрешено явно
    if (Array.isArray(updateData.specifications)) {
      product.specifications = updateData.specifications;
    } else if (updateData.specifications === null) {
      // Если клиент явно прислал null – очищаем массив
      product.specifications = [];
    }

    // Остальные поля, не вошедшие в simpleFields (например, removedImageIds и т.п.) не трогаем
    product.updatedBy = new Types.ObjectId(userId);
    product.updatedAt = new Date();

    await product.save();
    return this.formatProductForResponse(product);
  }

  async updateProductStatus(
    id: string,
    status: ProductStatusType,
    userId: string | Types.ObjectId,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(id))
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    if (!Object.values(ProductStatus).includes(status))
      throw ApiError.BadRequest("Некорректный статус продукта");
    try {
      const product = await ProductModel.findByIdAndUpdate(
        id,
        {
          status,
          updatedBy: userId,
          updatedAt: new Date(),
          ...(status === ProductStatus.ARCHIVED && { isVisible: false }),
        },
        { new: true, runValidators: true },
      ).lean({ virtuals: true });
      if (!product) throw ApiError.NotFoundError("Продукт не найден");
      return product;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при обновлении статуса продукта");
    }
  }

  async addRelatedProduct(
    productId: string,
    relatedProductId: string,
    userId: string | Types.ObjectId,
  ): Promise<any> {
    if (
      !Types.ObjectId.isValid(productId) ||
      !Types.ObjectId.isValid(relatedProductId)
    ) {
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    }
    if (productId === relatedProductId)
      throw ApiError.BadRequest("Продукт не может быть связан с самим собой");
    try {
      const [product, related] = await Promise.all([
        ProductModel.findById(productId),
        ProductModel.findById(relatedProductId),
      ]);
      if (!product || !related)
        throw ApiError.NotFoundError("Один из продуктов не найден");
      if (
        (product.relatedProducts as Types.ObjectId[]).some((id) =>
          id.equals(relatedProductId),
        )
      ) {
        throw ApiError.BadRequest("Продукт уже связан");
      }
      product.relatedProducts?.push(new Types.ObjectId(relatedProductId));
      product.updatedBy = userId as Types.ObjectId;
      await product.save();
      return product.toObject({ virtuals: true });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при добавлении связанного продукта");
    }
  }

  async getRelatedProducts(
    productId: string,
    options: { limit?: number } = {},
  ): Promise<any[]> {
    if (!Types.ObjectId.isValid(productId))
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    try {
      const product = await ProductModel.findById(productId)
        .populate({
          path: "relatedProducts",
          select: "title sku priceForIndividual status discount",
          match: {
            status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
            isVisible: true,
          },
          options: { limit: options.limit || 10 },
        })
        .lean({ virtuals: true });
      if (!product) throw ApiError.NotFoundError("Продукт не найден");
      const related = (product as any).relatedProducts || [];
      return related.map((p: any) => ({
        ...p,
        finalPriceForIndividual: this.calculateFinalPrice(p),
      }));
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при получении связанных продуктов");
    }
  }

  // ---- Вспомогательные методы ----
  private async validateRelatedProducts(
    productData: any,
    excludeId: string | null = null,
  ): Promise<void> {
    const relatedFields = [
      "relatedProducts",
      "upsellProducts",
      "crossSellProducts",
    ];
    for (const field of relatedFields) {
      const ids = productData[field];
      if (ids && Array.isArray(ids)) {
        const unique = [...new Set(ids.map((id: string) => id.toString()))];
        if (unique.length !== ids.length)
          throw ApiError.BadRequest(`Дублирующиеся ID в поле ${field}`);
        const existing = await ProductModel.find({
          _id: { $in: ids },
          ...(excludeId && { _id: { $ne: excludeId } }),
        }).select("_id");
        const existingIds = existing.map((p) => p._id.toString());
        const missing = ids.filter((id: string) => !existingIds.includes(id));
        if (missing.length) {
          throw ApiError.BadRequest(
            `Некоторые связанные продукты не существуют: ${missing.join(", ")}`,
          );
        }
      }
    }
  }

  /**
   * Роллбэк файлов при ошибке создания — удаляем через fileStorageService
   */
  private async rollbackProductFiles(productData: any): Promise<void> {
    const fileIds: string[] = [];

    if (Array.isArray(productData.images)) {
      fileIds.push(
        ...productData.images.filter((id: any) => typeof id === "string"),
      );
    }

    if (
      productData.instruction?.type === "file" &&
      productData.instruction.file
    ) {
      fileIds.push(productData.instruction.file.toString());
    }

    if (fileIds.length) {
      await fileStorageService
        .deleteFiles(fileIds, productData.createdBy || "")
        .catch(() => {});
    }
  }

  private formatProductForResponse(product: ProductDocument): any {
    const obj = product.toObject
      ? product.toObject({ virtuals: true })
      : product;

    // images уже populated через pre-hook
    if (Array.isArray(obj.images)) {
      obj.images = obj.images.map((item: any) => {
        if (item && typeof item === "object" && item._id) {
          return {
            _id: item._id,
            url: item.url, // уже обработан в FileManager.getFileUrl при необходимости
            originalName: item.originalName,
            mimetype: item.mimetype,
            size: item.size,
          };
        }
        return { _id: item?.toString?.() || item, url: null };
      });
    } else {
      obj.images = [];
    }

    // instruction
    if (obj.instruction) {
      const { type, file, link } = obj.instruction;

      if (type === "file") {
        obj.instruction = {
          type: "file",
          file: file?._id || file,
          url: file?.url || null,
          originalName: file?.originalName,
          mimetype: file?.mimetype,
          size: file?.size,
        };
      } else if (type === "link") {
        obj.instruction = {
          type: "link",
          link,
          url: link,
        };
      }
    }

    obj.finalPriceForIndividual = this.calculateFinalPrice(obj);
    return obj;
  }

  async checkProductOrders(_productId: string): Promise<boolean> {
    // временная заглушка
    return false;
  }

  async logStockChange(
    _productId: string,
    _quantity: number,
    _operation: string,
    _reason: string,
    _userId: string,
    _newQuantity: number,
  ): Promise<void> {
    // заглушка
  }
}

export default new ProductService();
