const ApiError = require("../exceptions/api-error");
const { ProductModel } = require("../models/indexModels");
const path = require("path");
const fs = require("fs");

const getProducts = async () => {
  try {
    return await ProductModel.find();
  } catch (e) {
    throw ApiError.InternalServerError(
      e.message || "Ошибка получения продуктов"
    );
  }
};

//ADMIN
const createProduct = async (productData, files) => {
  try {
    const product = JSON.parse(productData);
    delete product.images;

    const newProduct = await ProductModel.create(product);

    const images = files?.images
      ? files.images.map((file) => {
          const relativePath = "uploads" + file.path.split("uploads")[1].replace(/\\/g, "/");
          return relativePath;
        })
      : [];

    const instructionFile = files?.instruction
      ? (() => {
          const rel = "uploads" + files.instruction[0].path.split("uploads")[1].replace(/\\/g, "/");
          return rel;
        })()
      : null;

    newProduct.images = images;
    newProduct.instructionPath = instructionFile;

    await newProduct.save();

    return newProduct;
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка создания продукта");
  }
};

const editProduct = async (id, productData, deletedImages, removeInstruction, files) => {
  console.log(id, productData, deletedImages, removeInstruction, files);
  try {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw ApiError.NotFoundError("Продукт не найден");
    }

    // Удаление старых изображений
    if (deletedImages) {
      const imagesToDelete = JSON.parse(deletedImages);
      for (const imagePath of imagesToDelete) {
        const fullPath = path.join(__dirname, "..", imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
      product.images = product.images.filter(img => !imagesToDelete.includes(img));
    }

   // Обновление данных о продукте
   if (productData) {
    const data = JSON.parse(productData);
    delete data.images; // Не затирать вручную добавленные изображения
    Object.assign(product, data);
  }

// Добавление новых изображений — ДЕЛАЕМ ПОСЛЕ Object.assign
if (files["images"]) {
  console.log('newImages');
  const newImages = files["images"].map(file => {
    // Относительный путь от public-папки
    const relativePath = file.path.split("uploads")[1]; // например: /files/uuid/filename
    return `uploads${relativePath}`;
  });
  product.images.push(...newImages);
}

    // Обработка инструкции
    if (removeInstruction === "true" && product.instructionPath) {
      const instructionPath = path.join(__dirname, "..", product.instructionPath);
      if (fs.existsSync(instructionPath)) {
        fs.unlinkSync(instructionPath);
      }
      product.instructionPath = null;
    }

    if (files["instruction"]) {
      const instructionFile = files["instruction"][0];
      const relativePath = instructionFile.path.split("uploads")[1];
      product.instructionPath = `/uploads${relativePath}`;
    }


    await product.save();
    return product;
  } catch (error) {
    throw ApiError.InternalServerError(error);
  }
};

const archieveProduct = async (productId) => {
  try {
    const product = await ProductModel.findByIdAndUpdate(
      { _id: productId },
      { status: "archived" }
    );
    return product;
  } catch (e) {
    throw ApiError.InternalServerError(
      e.message || "Ошибка архивации продукта"
    );
  }
};

const deleteProduct = async (productId) => {
  try {
    const product = await ProductModel.findByIdAndDelete({ _id: productId }); //TODO
    return product;
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка удаления продукта");
  }
};

const uploadProductFile = async (file) => {
  try {
    return file;
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка загрузки продукта");
  }
};

const updateProductData = async (productData) => {
  try {
    const product = await ProductModel.findByIdAndUpdate(
      { _id: productData._id },
      productData
    );
    return productData;
  } catch (e) {
    throw ApiError.InternalServerError(
      e.message || "Ошибка обновления продукта"
    );
  }
};

module.exports = {
  getProducts,
  createProduct,
  archieveProduct,
  deleteProduct,
  uploadProductFile,
  editProduct
};
