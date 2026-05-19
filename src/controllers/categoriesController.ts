// category.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import categoryService from "../services/categoryService.js";
import type { ICategory } from "../types/category.types.js";
import type {
  CategoryResponse,
  CreateCategoryReq,
  DeleteCategoryReq,
  GetAllCategoriesReq,
  GetCategoryByIdReq,
  GetCategoryBySlugReq,
  GetCategoryListReq,
  GetProductCountReq,
  UpdateCategoryReq,
} from "../types/controllers/category-controller.js";

/**
 * Контроллер категорий.
 * Методы создания, обновления требуют авторизации (req.user.id).
 */
class CategoryController {
  /**
   * Получить все категории с фильтрацией и сортировкой.
   */
  getAllCategories = async (
    req: GetAllCategoriesReq,
    res: Response<CategoryResponse<ICategory[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        active = true,
        search,
        sortBy = "order",
        sortOrder = "asc",
        includeInactive = false,
        withProductCount = true,
      } = req.validatedQuery || req.query;

      const categories = await categoryService.getAllCategories(
        { active, search },
        {
          sortBy: sortBy as string,
          sortOrder: sortOrder as "asc" | "desc",
          includeInactive:
            includeInactive === "true" || includeInactive === true,
          withProductCount:
            withProductCount === "true" || withProductCount === true,
        },
      );

      res.json({
        success: true,
        data: categories,
        count: categories.length,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить плоский список категорий (без пагинации, упрощённый).
   */
  getCategoryList = async (
    req: GetCategoryListReq,
    res: Response<CategoryResponse<ICategory[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { includeInactive = false } = req.validatedQuery || req.query;
      const categories = await categoryService.getCategoryList({
        includeInactive: includeInactive === "true" || includeInactive === true,
      });
      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить категорию по ID.
   */
  getCategoryById = async (
    req: GetCategoryByIdReq,
    res: Response<CategoryResponse<ICategory>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { includeInactive = false } = req.query;
      const category = await categoryService.getCategoryById(id, {
        withProductCount: true,
        includeInactive: includeInactive === "true",
      });
      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить категорию по slug.
   */
  getCategoryBySlug = async (
    req: GetCategoryBySlugReq,
    res: Response<CategoryResponse<ICategory>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      const { includeInactive = false } = req.query;
      const category = await categoryService.getCategoryBySlug(slug, {
        includeInactive: includeInactive === "true",
        withProductCount: true,
      });
      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создать новую категорию (требуется авторизация).
   */
  createCategory = async (
    req: CreateCategoryReq,
    res: Response<CategoryResponse<ICategory>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const categoryData = req.validatedData || req.body;
      const userId = req.user.id;
      const category = await categoryService.createCategory(
        categoryData,
        userId,
      );
      res.status(201).json({
        success: true,
        message: "Категория успешно создана",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновить категорию (требуется авторизация).
   */
  updateCategory = async (
    req: UpdateCategoryReq,
    res: Response<CategoryResponse<ICategory>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.validatedData || req.body;
      const userId = req.user.id;
      const category = await categoryService.updateCategory(
        id,
        updateData,
        userId,
      );
      res.json({
        success: true,
        message: "Категория успешно обновлена",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удалить категорию (требуется авторизация).
   */
  deleteCategory = async (
    req: DeleteCategoryReq,
    res: Response<CategoryResponse<{ message: string }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await categoryService.deleteCategory(id);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить количество продуктов в категории.
   */
  getProductCount = async (
    req: GetProductCountReq,
    res: Response<CategoryResponse<{ count: number }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const count = await categoryService.getProductCount(id);
      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new CategoryController();
