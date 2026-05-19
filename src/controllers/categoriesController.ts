// controllers/categoriesController.ts
import type { NextFunction, Response } from "express";
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
      // Безопасное извлечение параметров из query (с поддержкой validatedQuery)
      const query =
        (req.validatedQuery as Record<string, unknown>) || req.query || {};

      const active = query.active === "false" ? false : true;
      const search = query.search as string | undefined;
      const sortBy = (query.sortBy as string) || "order";
      const sortOrder = (query.sortOrder === "desc" ? "desc" : "asc") as
        | "asc"
        | "desc";
      const includeInactive =
        query.includeInactive === "true" || query.includeInactive === true;
      const withProductCount = query.withProductCount !== "false";

      const categories = await categoryService.getAllCategories(
        { active, search },
        {
          sortBy,
          sortOrder,
          includeInactive,
          withProductCount,
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
      const query =
        (req.validatedQuery as Record<string, unknown>) || req.query || {};
      const includeInactive = query.includeInactive === "true";
      const categories = await categoryService.getCategoryList({
        includeInactive,
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
      const includeInactive = req.query?.includeInactive === "true";
      const category = await categoryService.getCategoryById(id, {
        withProductCount: true,
        includeInactive,
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
      const includeInactive = req.query?.includeInactive === "true";
      const category = await categoryService.getCategoryBySlug(slug, {
        includeInactive,
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

      // Приводим поле image к типу ICategoryImage | undefined
      if (updateData.image !== undefined) {
        if (updateData.image === null) {
          updateData.image = undefined; // удалить изображение
        } else if (typeof updateData.image === "string") {
          // Если пришла строка URL, преобразуем в объект
          updateData.image = { url: updateData.image };
        } else if (
          typeof updateData.image === "object" &&
          updateData.image !== null
        ) {
          // Оставляем как есть, но убеждаемся, что это ICategoryImage
          const img = updateData.image as Record<string, unknown>;
          updateData.image = {
            url: img.url as string | undefined,
            alt: img.alt as string | undefined,
            size: img.size as number | undefined,
            mimetype: img.mimetype as string | undefined,
          };
        }
      }

      const userId = req.user.id;
      const category = await categoryService.updateCategory(
        id,
        updateData as Partial<ICategory>,
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
