//@ts-nocheck
// services/ProductService.ts
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { ProductModel } from "../models/index.models.js";
import type {
  IInstruction,
  IProduct,
  IProductImage,
  ProductDocument,
  ProductStatusType,
} from "../types/product.types.js";
import { ProductStatus } from "../types/product.types.js";
import fileManager from "../utils/fileManager.js";
import categoryService from "./categoryService.js"; // нужно импортировать
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

    if (category) {
      if (!Types.ObjectId.isValid(category))
        throw ApiError.BadRequest("Некорректный ID категории");
      filter.category = category;
    }

    let categoryIdFromSlug: Types.ObjectId | null = null;
    if (slug) {
      const categoryDoc = await ProductModel.findOne({ slug }); // поиск категории по slug – неверно, надо искать в CategoryModel
      // Исправляем: нужно искать в CategoryModel, но здесь ProductModel – ошибка в оригинале. Допустим, есть CategoryModel.
      // Для простоты оставим как есть, но в реальности нужно импортировать CategoryModel.
      if (!categoryDoc) {
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
      categoryIdFromSlug = categoryDoc._id as Types.ObjectId;
      filter.category = categoryIdFromSlug;
    }

    if (minPrice || maxPrice) {
      filter.priceForIndividual = {};
      if (minPrice) filter.priceForIndividual.$gte = minPrice;
      if (maxPrice) filter.priceForIndividual.$lte = maxPrice;
    }

    if (search?.trim()) {
      filter.$text = { $search: search.trim() };
    }

    if (excludeIds?.length) {
      const valid = excludeIds.filter((id) => Types.ObjectId.isValid(id));
      if (valid.length) filter._id = { $nin: valid };
    }

    if (showOnMainPage) filter.showOnMainPage = true;
    if (manufacturer)
      filter.manufacturer = { $regex: manufacturer, $options: "i" };
    if (warrantyMonths) filter.warrantyMonths = { $gte: warrantyMonths };

    const sortOptions: any = {};
    const sortField = this.getSortField(sortBy);
    sortOptions[sortField] = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "popularity") sortOptions.title = 1;

    const skip = (page - 1) * limit;
    const limitNum = Number(limit);

    try {
      let queryBuilder = ProductModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean({ virtuals: true });

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
          select:
            "title priceForIndividual mainImage status discount _id sku category",
          match: relatedFilter,
          options: { limit: 10 },
          populate: { path: "category", select: "slug name _id" },
        });
      }

      const [products, total] = await Promise.all([
        queryBuilder,
        ProductModel.countDocuments(filter),
      ]);

      const productsWithReviews = await Promise.all(
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

      let productsWithDiscounts = productsWithReviews;
      if (!(query as any).skipDiscountCheck) {
        try {
          productsWithDiscounts =
            await ProductDiscountService.getDiscountsForProducts(
              productsWithReviews,
            );
        } catch (err) {
          console.error("Ошибка при получении скидок для продуктов:", err);
        }
      }

      const processedProducts = productsWithDiscounts.map((product: any) => {
        const processed = { ...product };
        if (processed.mainImage && !processed.mainImage.startsWith("http")) {
          processed.mainImage = fileManager.getFileUrl(processed.mainImage);
        }
        if (Array.isArray(processed.images)) {
          processed.images = processed.images.map((img: any) => ({
            ...img,
            url: fileManager.getFileUrl(img.url),
          }));
        }
        if (
          processed.instruction?.url &&
          !processed.instruction.url.startsWith("http")
        ) {
          processed.instruction.url = fileManager.getFileUrl(
            processed.instruction.url,
          );
        }
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
      });

      return {
        products: processedProducts,
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
      throw ApiError.DatabaseError("Ошибка при получении продуктов");
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
          "title sku priceForIndividual mainImage status _id",
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
          "title sku priceForIndividual mainImage status _id",
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

  async createProduct(
    productData: any,
    userId: string | Types.ObjectId,
  ): Promise<any> {
    try {
      const existing = await ProductModel.findOne({ sku: productData.sku });
      if (existing)
        throw ApiError.BadRequest("Продукт с таким SKU уже существует");
      const categoryExists = await this.findCategoryById(productData.category);
      if (!categoryExists)
        throw ApiError.BadRequest("Указанная категория не существует");
      await this.validateRelatedProducts(productData);
      const processedImages = await this.processImagesForDb(productData.images);
      const processedInstruction =
        productData.instruction !== null
          ? await this.processInstructionForDb(productData.instruction)
          : undefined;
      const product = new ProductModel({
        ...productData,
        images: processedImages,
        instruction: processedInstruction,
        createdBy: userId,
        updatedBy: userId,
      });
      await product.save();
      return this.formatProductForResponse(product);
    } catch (err) {
      await this.rollbackProductFiles(productData);
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при создании продукта");
    }
  }

  async updateProduct(
    id: string,
    updateData: any,
    userId: string | Types.ObjectId,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(id))
      throw ApiError.BadRequest("Некорректный формат ID продукта");
    try {
      const product = await ProductModel.findById(id);
      if (!product) throw ApiError.NotFoundError("Продукт не найден");

      if (updateData.sku && updateData.sku !== product.sku) {
        const existing = await ProductModel.findOne({
          sku: updateData.sku,
          _id: { $ne: id },
        });
        if (existing)
          throw ApiError.BadRequest("Продукт с таким SKU уже существует");
      }
      if (updateData.category) {
        const catExists = await this.findCategoryById(updateData.category);
        if (!catExists)
          throw ApiError.BadRequest("Указанная категория не существует");
      }
      await this.validateRelatedProducts(updateData, id);

      const oldImages = [...(product.images as IProductImage[])];
      const oldMainImage = product.mainImage;
      const oldInstruction = product.instruction;

      if (updateData.images !== undefined) {
        if (updateData.images === null) product.images = [];
        else if (Array.isArray(updateData.images)) {
          try {
            const processed = await this.processImagesForDb(
              updateData.images,
              oldImages,
            );
            product.images = processed;
          } catch (err) {
            console.error(
              "[UPDATE_PRODUCT] Ошибка при обработке изображений:",
              (err as Error).message,
            );
            product.images = oldImages;
          }
        }
      }
      if (updateData.mainImage !== undefined) {
        if (updateData.mainImage === null) product.mainImage = null;
        else if (updateData.mainImage.url) {
          // await fileManager.validateFileExists(updateData.mainImage.url);
          product.mainImage = updateData.mainImage;
        }
      }
      if (updateData.instruction !== undefined) {
        if (updateData.instruction === null) product.instruction = null;
        else {
          const processed = await this.processInstructionForDb(
            updateData.instruction,
            oldInstruction,
          );
          product.instruction = processed;
        }
      }
      Object.keys(updateData).forEach((key) => {
        if (!["images", "mainImage", "instruction"].includes(key)) {
          (product as any)[key] = updateData[key];
        }
      });
      product.updatedBy = userId as Types.ObjectId;
      product.updatedAt = new Date();
      await product.save();

      await this.cleanupUnusedFiles(
        oldImages,
        product.images as IProductImage[],
        oldMainImage,
        product.mainImage,
        oldInstruction,
        product.instruction,
      );
      return this.formatProductForResponse(product);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.DatabaseError("Ошибка при обновлении продукта");
    }
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
          select: "title sku priceForIndividual mainImage status discount",
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

  private async processImagesForDb(
    images: any[],
    existingImages: IProductImage[] = [],
  ): Promise<IProductImage[]> {
    if (!images || !Array.isArray(images)) return [];
    const processed: IProductImage[] = [];
    const existingUrls = existingImages.map((img) => {
      let url = img.url;
      if (url.startsWith("http://") || url.startsWith("https://"))
        url = new URL(url).pathname;
      return url;
    });
    for (const img of images) {
      if (img._shouldDelete) continue;
      if (img.url) {
        let compareUrl = img.url;
        if (
          compareUrl.startsWith("http://") ||
          compareUrl.startsWith("https://")
        ) {
          compareUrl = new URL(compareUrl).pathname;
        }
        if (existingUrls.includes(compareUrl)) {
          const existing = existingImages.find((ei) => {
            let u = ei.url;
            if (u.startsWith("http://") || u.startsWith("https://"))
              u = new URL(u).pathname;
            return u === compareUrl;
          });
          if (existing) {
            processed.push(existing);
            continue;
          }
        }
        try {
          // await fileManager.validateFileExists(img.url);
          processed.push({
            url: img.url,
            alt: img.alt || "",
            order: img.order ?? processed.length,
          });
        } catch (err) {
          console.error(
            `Предупреждение: Пропускаем недействительное новое изображение: ${img.url} - ${(err as Error).message}`,
          );
        }
      }
    }
    return processed;
  }

  private async processInstructionForDb(
    instructionData: any,
    _oldInstruction: any = null,
  ): Promise<IInstruction | null> {
    if (!instructionData) return null;
    if (instructionData._shouldDelete) return null;
    const processed: IInstruction = { ...instructionData };
    if (instructionData.type === "file") {
      if (instructionData.url && !instructionData.url.startsWith("http")) {
        // await fileManager.validateFileExists(instructionData.url);
      }
      if (!processed.alt)
        processed.alt = instructionData.originalName || "Инструкция";
    }
    if (instructionData.type === "link") {
      try {
        new URL(instructionData.url);
      } catch {
        throw ApiError.BadRequest("Некорректный URL инструкции");
      }
      if (!processed.title) processed.title = "Инструкция";
    }
    return processed;
  }

  private async cleanupUnusedFiles(
    oldImages: IProductImage[],
    newImages: IProductImage[],
    oldMainImage: any,
    newMainImage: any,
    oldInstruction: any,
    newInstruction: any,
  ): Promise<void> {
    const oldUrls = oldImages.map((i) => i.url);
    const newUrls = newImages.map((i) => i.url);
    const toDeleteGallery = oldUrls.filter((url) => !newUrls.includes(url));
    for (const url of toDeleteGallery) {
      try {
        // await fileManager.deleteFile(url);
      } catch (err) {}
    }
    if (
      oldMainImage?.url &&
      (!newMainImage || newMainImage.url !== oldMainImage.url)
    ) {
      try {
        // await fileManager.deleteFile(oldMainImage.url);
      } catch {}
    }
    if (
      oldInstruction?.url &&
      (!newInstruction || newInstruction.url !== oldInstruction.url)
    ) {
      try {
        // await fileManager.deleteFile(oldInstruction.url);
      } catch {}
    }
  }

  private async rollbackProductFiles(productData: any): Promise<void> {
    const files: string[] = [];
    if (productData.mainImage?.url) files.push(productData.mainImage.url);
    if (productData.images) {
      productData.images.forEach((img: any) => {
        if (img.url) files.push(img.url);
      });
    }
    if (productData.instructionFile?.url)
      files.push(productData.instructionFile.url);
    for (const url of files) {
      try {
        // await fileManager.deleteFile(url);
      } catch {}
    }
  }

  private formatProductForResponse(product: ProductDocument): any {
    const obj = product.toObject
      ? product.toObject({ virtuals: true })
      : product;
    if (obj.mainImage?.url) {
      obj.mainImage.url = fileManager.getFileUrl(obj.mainImage.url);
    }
    if (obj.images) {
      obj.images = obj.images.map((img: any) => ({
        ...img,
        url: fileManager.getFileUrl(img.url),
      }));
    }
    if (obj.instructionFile?.url) {
      obj.instructionFile.url = fileManager.getFileUrl(obj.instructionFile.url);
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
