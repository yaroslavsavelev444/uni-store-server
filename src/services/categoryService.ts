// services/CategoryService.ts
import path from "node:path";
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";
import { CategoryModel, ProductModel } from "../models/index.models.js";
import type { ICategory } from "../types/category.types.js";
import fileManager from "../utils/fileManager.js";

interface GetCategoriesOptions {
  active?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  includeInactive?: boolean;
  withProductCount?: boolean;
}

interface GetCategoryOptions {
  includeInactive?: boolean;
  withProductCount?: boolean;
}

type CategoryWithId = ICategory & { _id: Types.ObjectId };
type CategoryWithProductCount = CategoryWithId & { productCount: number };
type CategoryWithOptionalProductCount = CategoryWithId & {
  productCount?: number;
};

class CategoryService {
  private async processImage(imageUrl: string): Promise<string> {
    let filePath = imageUrl;
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const url = new URL(imageUrl);
      filePath = url.pathname;
      filePath = decodeURIComponent(filePath);
    }

    if (filePath.includes("/temp/")) {
      const timestamp = Date.now();
      const filename = path.basename(filePath);
      const newWebPath = `/uploads/categories/images/${timestamp}_${filename}`;
      // await fileManager.moveFile(filePath, newWebPath);
      return newWebPath;
    }

    // await fileManager.validateFileExists(filePath);
    return filePath;
  }

  private async addProductCount(
    category: CategoryWithId,
  ): Promise<CategoryWithProductCount> {
    const count = await ProductModel.countDocuments({
      category: category._id,
      isVisible: true,
      status: { $in: ["available", "preorder"] },
    });
    return { ...category, productCount: count };
  }

  async getAllCategories(
    _filters: Record<string, unknown> = {},
    options: GetCategoriesOptions = {},
  ): Promise<CategoryWithProductCount[]> {
    const {
      active = true,
      search,
      sortBy = "order",
      sortOrder = "asc",
      includeInactive = false,
      withProductCount = true,
    } = options;

    const query: Record<string, unknown> = {};
    if (!includeInactive) {
      query.isActive = active;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions: Record<string, 1 | -1> = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const categories = (await CategoryModel.find(query)
      .sort(sortOptions)
      .lean()) as CategoryWithId[];

    if (!withProductCount) {
      return categories.map((cat) => ({ ...cat, productCount: 0 }));
    }

    const categoriesWithCounts = await Promise.all(
      categories.map((cat) => this.addProductCount(cat)),
    );
    return categoriesWithCounts;
  }

  async getCategoryById(
    id: string | Types.ObjectId,
    options: GetCategoryOptions = {},
  ): Promise<CategoryWithOptionalProductCount> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw ApiError.BadRequest("Некорректный формат ID категории");
    }

    const category = (await CategoryModel.findById(
      id,
    ).lean()) as CategoryWithId | null;
    if (!category) {
      throw ApiError.NotFoundError("Категория не найдена");
    }
    if (!category.isActive && !options.includeInactive) {
      throw ApiError.NotFoundError("Категория не доступна");
    }

    const result: CategoryWithOptionalProductCount = {
      ...category,
      productCount: undefined,
    };
    if (options.withProductCount) {
      const count = await ProductModel.countDocuments({
        category: category._id,
        isVisible: true,
        status: { $in: ["available", "preorder"] },
      });
      result.productCount = count;
    }
    return result;
  }

  async getCategoryBySlug(
    slug: string,
    options: GetCategoryOptions = {},
  ): Promise<CategoryWithOptionalProductCount> {
    const category = (await CategoryModel.findOne({
      slug,
    }).lean()) as CategoryWithId | null;
    if (!category) {
      throw ApiError.NotFoundError("Категория не найдена");
    }
    if (!category.isActive && !options.includeInactive) {
      throw ApiError.NotFoundError("Категория не доступна");
    }

    const result: CategoryWithOptionalProductCount = {
      ...category,
      productCount: undefined,
    };
    if (options.withProductCount) {
      const count = await ProductModel.countDocuments({
        category: category._id,
        isVisible: true,
        status: { $in: ["available", "preorder"] },
      });
      result.productCount = count;
    }
    return result;
  }

  async createCategory(
    categoryData: Partial<ICategory>,
    userId: string | Types.ObjectId,
  ): Promise<ICategory> {
    if (categoryData.slug) {
      const existing = await CategoryModel.findOne({ slug: categoryData.slug });
      if (existing) {
        throw ApiError.BadRequest("Категория с таким slug уже существует");
      }
    }

    let processedImage: ICategory["image"] | undefined;
    if (categoryData.image?.url) {
      const processedUrl = await this.processImage(categoryData.image.url);
      processedImage = {
        ...categoryData.image,
        url: processedUrl,
      };
    } else {
      processedImage = categoryData.image;
    }

    const category = new CategoryModel({
      ...categoryData,
      image: processedImage,
      createdBy: userId,
      updatedBy: userId,
    });

    await category.save();
    return category.toObject();
  }

  async updateCategory(
    id: string | Types.ObjectId,
    updateData: Partial<ICategory>,
    userId: string | Types.ObjectId,
  ): Promise<ICategory> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw ApiError.BadRequest("Некорректный формат ID категории");
    }

    const existingCategory = await CategoryModel.findById(id);
    if (!existingCategory) {
      throw ApiError.NotFoundError("Категория не найдена");
    }

    if (updateData.slug && updateData.slug !== existingCategory.slug) {
      const duplicate = await CategoryModel.findOne({ slug: updateData.slug });
      if (duplicate) {
        throw ApiError.BadRequest("Категория с таким slug уже существует");
      }
    }

    if (updateData.image !== undefined) {
      if (updateData.image === null) {
        if (existingCategory.image?.url) {
          // await fileManager.deleteFile(existingCategory.image.url);
        }
        updateData.image = null as unknown as ICategory["image"];
      } else if (updateData.image?.url) {
        const newImageUrl = await this.processImage(updateData.image.url);
        if (existingCategory.image?.url) {
          // await fileManager.deleteFile(existingCategory.image.url);
        }
        updateData.image.url = newImageUrl;
      }
    }

    Object.assign(existingCategory, updateData);
    existingCategory.updatedBy = userId as Types.ObjectId;
    await existingCategory.save();
    return existingCategory.toObject();
  }

  async deleteCategory(
    id: string | Types.ObjectId,
  ): Promise<{ success: boolean; message: string }> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw ApiError.BadRequest("Некорректный формат ID категории");
    }

    const category = await CategoryModel.findById(id);
    if (!category) {
      throw ApiError.NotFoundError("Категория не найдена");
    }

    const productCount = await ProductModel.countDocuments({ category: id });
    if (productCount > 0) {
      throw ApiError.BadRequest("Невозможно удалить категорию с товарами");
    }

    if (category.image?.url) {
      // await fileManager.deleteFile(category.image.url);
    }

    await category.deleteOne();
    return { success: true, message: "Категория успешно удалена" };
  }

  async getCategoryList(
    options: { includeInactive?: boolean } = {},
  ): Promise<CategoryWithProductCount[]> {
    const { includeInactive = false } = options;
    const query: Record<string, unknown> = {};
    if (!includeInactive) {
      query.isActive = true;
    }

    const categories = (await CategoryModel.find(query)
      .sort({ order: 1, name: 1 })
      .lean()) as CategoryWithId[];
    const categoriesWithCounts = await Promise.all(
      categories.map((cat) => this.addProductCount(cat)),
    );
    return categoriesWithCounts;
  }

  async getProductCount(categoryId: string | Types.ObjectId): Promise<number> {
    return ProductModel.countDocuments({
      category: categoryId,
      isVisible: true,
      status: { $in: ["available", "preorder"] },
    });
  }
}

export default new CategoryService();
