import {
  createCategory as _createCategory,
  deleteCategory as _deleteCategory,
  getAllCategories as _getAllCategories,
  getCategoryById as _getCategoryById,
  getCategoryBySlug as _getCategoryBySlug,
  getCategoryList as _getCategoryList,
  getProductCount as _getProductCount,
  updateCategory as _updateCategory,
} from "../services/categoryService";

class CategoryController {
  // Получить все категории
  async getAllCategories(req, res, next) {
    try {
      const {
        active = true,
        search,
        sortBy = "order",
        sortOrder = "asc",
        includeInactive = false,
        withProductCount = true,
      } = req.validatedQuery || req.query;

      const categories = await _getAllCategories(
        { active, search },
        { sortBy, sortOrder, includeInactive, withProductCount },
      );

      res.json({
        success: true,
        data: categories,
        count: categories.length,
      });
    } catch (error) {
      next(error);
    }
  }

  // Получить список категорий (вместо дерева)
  async getCategoryList(req, res, next) {
    try {
      const { includeInactive = false } = req.validatedQuery || req.query;

      const categories = await _getCategoryList({ includeInactive });

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  // Получить категорию по ID
  async getCategoryById(req, res, next) {
    try {
      const { id } = req.params;

      const options = {
        withProductCount: true,
        includeInactive: req.query.includeInactive === "true",
      };

      const category = await _getCategoryById(id, options);

      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  // Получить категорию по slug
  async getCategoryBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const { includeInactive = false } = req.query;

      const category = await _getCategoryBySlug(slug, {
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
  }

  // Создать категорию
  async createCategory(req, res, next) {
    try {
      const categoryData = req.validatedData;
      const userId = req.user.id;

      const category = await _createCategory(categoryData, userId);

      res.status(201).json({
        success: true,
        message: "Категория успешно создана",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  // Обновить категорию
  async updateCategory(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.validatedData;
      const userId = req.user.id;

      const category = await _updateCategory(id, updateData, userId);

      res.json({
        success: true,
        message: "Категория успешно обновлена",
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  // Удалить категорию
  async deleteCategory(req, res, next) {
    try {
      const { id } = req.params;

      const result = await _deleteCategory(id);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // Получить количество продуктов в категории
  async getProductCount(req, res, next) {
    try {
      const { id } = req.params;

      const count = await _getProductCount(id);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CategoryController();
