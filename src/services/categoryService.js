const ApiError = require("../exceptions/api-error");
const { CategoryModel, ProductModel } = require("../models/indexModels");
const path = require("path");
const fs = require("fs");
const { deleteProduct, deleteFolderRecursive } = require("./productService");

const findById = async (id) => {
    return CategoryModel.findById(id);
  };

  const getCategories = async () => {
  try {
    const res = await CategoryModel.find().lean();

    const withCounts = await Promise.all(
      res.map(async (category) => {
        const count = await ProductModel.countDocuments({
          categoryId: category._id,
          status: { $in: ['active', 'preorder'] } // ← только активные и предзаказ
        });
        return { ...category, productCount: count };
      })
    );

    return withCounts;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || 'Произошла ошибка');
  }
};

const createCategory = async (categoryData) => {
  try {
    const newCategory = new CategoryModel(categoryData);
    await newCategory.save();
    return newCategory;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Ошибка создания категории");
  }
};

  
  const updateCategory = async (id, updateData) => {
    return CategoryModel.findByIdAndUpdate(id, updateData, { new: true });
  };
  
  const updateCategoryWithImage = async (
    id,
    updatedData,
    file,
    uploadPath,
    savedFilename,
    oldImagePath
  ) => {
    if (file && uploadPath && savedFilename) {
      const newImagePath = path.join(uploadPath, savedFilename).replace(/\\/g, "/");
  
      // Удаляем старую папку
      if (oldImagePath) {
        const oldFolder = oldImagePath.split("/").slice(0, -1).join("/");
        const fullOldFolderPath = path.join(__dirname, "..", oldFolder);
  
        if (fs.existsSync(fullOldFolderPath)) {
          fs.rmSync(fullOldFolderPath, { recursive: true, force: true });
        }
      }
  
      updatedData.image = newImagePath;
    }
  
    return updateCategory(id, updatedData);
  };


  const deleteCategory = async (categoryId) => {
  try {
    const category = await CategoryModel.findById(categoryId);
    if (!category) throw ApiError.NotFoundError("Категория не найдена");

    // Удаляем связанные товары
    const products = await ProductModel.find({ categoryId });
    await Promise.all(products.map(product => deleteProduct(product._id)));

    // Удаляем папку с изображением
    if (category.image) {
      const oldFolder = category.image.split("/").slice(0, -1).join("/");
      const fullOldFolderPath = path.join(__dirname, "..", oldFolder);

      // Проверка на существование перед удалением
      if (fs.existsSync(fullOldFolderPath)) {
        await deleteFolderRecursive(fullOldFolderPath);
      }
    }

    // Удаляем категорию
    await CategoryModel.findByIdAndDelete(categoryId);

    return { message: "Категория и связанные товары успешно удалены" };
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Ошибка при удалении категории");
  }
};

const clearCategory = async (categoryId) => {
    try {
        //Ищем все товары привязанные к категории 
        const products = await ProductModel.find({categoryId: categoryId});
        products.forEach(async (product) => {
            await deleteProduct(product._id);
        });

        return;
    } catch (error) {
        throw ApiError.InternalServerError(error.message || "Произошла ошибка");
    };
};

const changeCategory = async (categoryData) => {
    try {
        return await CategoryModel.findByIdAndUpdate(categoryData._id, categoryData);
    } catch (error) {
        throw ApiError.InternalServerError(error.message || "Произошла ошибка");
    };
};

module.exports = {
    createCategory,
    deleteCategory,
    clearCategory,
    changeCategory,
    getCategories,
    createCategory,
    findById,
    updateCategory,
    updateCategoryWithImage,
}