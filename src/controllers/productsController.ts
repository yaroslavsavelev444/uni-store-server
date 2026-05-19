//@ts-nocheck
import type { NextFunction, Response } from "express";
import mongoose from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { ProductStatus } from "../models/product-model.js";
import productService from "../services/productService.js";
import type {
  AddRelatedProductReq,
  CreateProductReq,
  CreateProductResponse,
  GetAllProductsReq,
  GetProductByIdReq,
  GetProductBySkuReq,
  GetProductStatusesReq,
  GetProductsByCategoryReq,
  GetRelatedProductsReq,
  GetSimilarProductsReq,
  ProductListResponse,
  ProductResponse,
  ProductStatusesResponse,
  RelatedProductsResponse,
  SimilarProductsResponse,
  UpdateProductReq,
  UpdateProductResponse,
  UpdateProductStatusReq,
} from "../types/controllers/product-controller.js";
import type { IProduct, ProductStatusType } from "../types/product.types.js";

import { processProductFiles } from "../utils/productFileProcessor.js";

class ProductController {
  /**
   * GET /api/products
   */
  getAllProducts = async (
    req: GetAllProductsReq,
    res: Response<ProductListResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = req.validatedQuery || {};

      // Преобразуем excludeIds в массив, если это строка
      if (query.excludeIds) {
        if (typeof query.excludeIds === "string") {
          query.excludeIds = [query.excludeIds];
        } else if (Array.isArray(query.excludeIds)) {
          // Убедимся, что все ID валидны
          query.excludeIds = query.excludeIds.filter((id: string) =>
            mongoose.Types.ObjectId.isValid(id),
          );
        }
      }

      const result = await productService.getAllProducts(query);

      res.json({
        success: true,
        data: result.products,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/products/:id
   */
  getProductById = async (
    req: GetProductByIdReq,
    res: Response<ProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { populate = "none" } = req.query;
      const isAdmin = req.user && req.user.role === "admin";

      const product = await productService.getProductById(id, {
        populate,
        isAdmin,
      });

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/products/sku/:sku
   */
  getProductBySku = async (
    req: GetProductBySkuReq,
    res: Response<ProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { populate = "true" } = req.query;
      const isAdmin = req.user && req.user.role === "admin";
      const userId = req.user && req.user.id;
      const product = await productService.getProductBySku(sku, {
        populate,
        isAdmin,
        userId,
      });
      console.log("product", product);

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/products (admin)
   */
  createProduct = async (
    req: CreateProductReq,
    res: Response<CreateProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const productData = req.validatedData || req.body;
      const userId = req.user.id;

      const processedData = await processProductFiles(productData);
      const product = await productService.createProduct(processedData, userId);

      res.status(201).json({
        success: true,
        message: "Продукт успешно создан",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/products/:id (admin)
   */
  updateProduct = async (
    req: UpdateProductReq,
    res: Response<UpdateProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.validatedData || req.body;
      const userId = req.user.id;

      const processedData = await processProductFiles(updateData);
      // Проверяем существование продукта (можно через сервис)
      await productService.getProductById(id, { isAdmin: true });
      const product = await productService.updateProduct(
        id,
        processedData,
        userId,
      );

      res.json({
        success: true,
        message: "Продукт успешно обновлен",
        data: product,
      });
    } catch (error) {
      console.error("[UPDATE_PRODUCT] error", error);
      next(error);
    }
  };

  /**
   * GET /api/products/:id/similar
   */
  getSimilarProducts = async (
    req: GetSimilarProductsReq,
    res: Response<SimilarProductsResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { limit = 4, strategy = "mixed" } = req.query;

      // Получаем текущий продукт
      const currentProduct = await productService.getProductById(id, {
        populate: "category",
      });

      if (!currentProduct) {
        throw ApiError.NotFoundError("Продукт не найден");
      }

      let similarProducts: IProduct[] = [];
      const limitNum = parseInt(String(limit), 10);

      switch (strategy) {
        case "category": {
          const categoryResult = await productService.getAllProducts({
            category: currentProduct.category?._id?.toString(),
            excludeIds: [id],
            limit: limitNum,
            sortBy: "popularity",
          });
          similarProducts = categoryResult.products;
          break;
        }
        case "price": {
          const priceResult = await productService.getAllProducts({
            minPrice: currentProduct.priceForIndividual * 0.7,
            maxPrice: currentProduct.priceForIndividual * 1.3,
            excludeIds: [id],
            limit: limitNum,
            sortBy: "popularity",
          });
          similarProducts = priceResult.products;
          break;
        }
        case "mixed":
        default: {
          const categoryResult = await productService.getAllProducts({
            category: currentProduct.category?._id?.toString(),
            excludeIds: [id],
            limit: limitNum,
            sortBy: "popularity",
          });
          const categoryProducts = categoryResult.products;
          if (categoryProducts.length < limitNum) {
            const remaining = limitNum - categoryProducts.length;
            const excludeIds = [
              id,
              ...categoryProducts.map((p: IProduct) => p._id.toString()),
            ];
            const priceResult = await productService.getAllProducts({
              minPrice: currentProduct.priceForIndividual * 0.7,
              maxPrice: currentProduct.priceForIndividual * 1.3,
              excludeIds,
              limit: remaining,
              sortBy: "popularity",
            });
            similarProducts = [...categoryProducts, ...priceResult.products];
          } else {
            similarProducts = categoryProducts.slice(0, limitNum);
          }
          break;
        }
      }

      similarProducts = similarProducts.slice(0, limitNum);
      res.json({
        success: true,
        data: similarProducts,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/products/category/:categoryId
   */
  getProductsByCategory = async (
    req: GetProductsByCategoryReq,
    res: Response<ProductListResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { categoryId } = req.params;
      const {
        limit = 20,
        excludeIds,
        sortBy = "popularity",
        sortOrder = "desc",
      } = req.query;

      const result = await productService.getAllProducts({
        category: categoryId,
        excludeIds: excludeIds
          ? Array.isArray(excludeIds)
            ? (excludeIds as string[])
            : [excludeIds as string]
          : undefined,
        limit: parseInt(String(limit), 10),
        sortBy: sortBy as string,
        sortOrder: sortOrder as "asc" | "desc",
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

  /**
   * PATCH /api/products/:id/status (admin)
   */
  updateProductStatus = async (
    req: UpdateProductStatusReq,
    res: Response<ProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.validatedData || req.body;
      const userId = req.user.id;

      const product = await productService.updateProductStatus(
        id,
        status,
        userId,
      );

      res.json({
        success: true,
        message: `Статус продукта изменен на "${status}"`,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/products/:id/related
   */
  getRelatedProducts = async (
    req: GetRelatedProductsReq,
    res: Response<RelatedProductsResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { limit = 10 } = req.query;

      const relatedProducts = await productService.getRelatedProducts(id, {
        limit: parseInt(String(limit), 10),
      });

      res.json({
        success: true,
        data: relatedProducts,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/products/:id/related (admin)
   */
  addRelatedProduct = async (
    req: AddRelatedProductReq,
    res: Response<ProductResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { relatedProductId } = req.validatedData || req.body;
      const userId = req.user.id;

      if (id === relatedProductId) {
        throw ApiError.BadRequest("Продукт не может быть связан с самим собой");
      }

      const product = await productService.addRelatedProduct(
        id,
        relatedProductId,
        userId,
      );

      res.json({
        success: true,
        message: "Связанный продукт добавлен",
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/products/statuses (публичный или админский)
   */
  getProductStatuses = async (
    _req: GetProductStatusesReq,
    res: Response<ProductStatusesResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const statuses = Object.entries(ProductStatus).map(([key, value]) => ({
        key,
        value: value as ProductStatusType,
        label: this.getStatusLabel(value as ProductStatusType),
      }));

      res.json({
        success: true,
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  };

  private getStatusLabel(status: ProductStatusType): string {
    const labels: Record<ProductStatusType, string> = {
      [ProductStatus.AVAILABLE]: "Доступен",
      [ProductStatus.UNAVAILABLE]: "Недоступен",
      [ProductStatus.PREORDER]: "Предзаказ",
      [ProductStatus.ARCHIVED]: "В архиве",
    };
    return labels[status] || status;
  }
}

export default new ProductController();
