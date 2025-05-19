const ApiError = require("../exceptions/api-error");
const { ProductModel, OrderModel, ProductReviewModel } = require("../models/indexModels");
const path = require("path");
const fs = require('fs/promises');



const deleteFolderRecursive = async (folderPath) => {
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    console.log(`Папка удалена: ${folderPath}`);
  } catch (err) {
    console.error(`Ошибка при удалении папки ${folderPath}:`, err.message);
  }
};


const deleteProduct = async (productId) => {
  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw ApiError.NotFoundError("Продукт не найден");
    }

    // Удаление папки изображений
    if (product.images?.length > 0) {
      const imagePath = product.images[0]; // пример: 'uploads/products/uuid/filename.jpg'
      const parts = imagePath.split(path.sep);
      const folderUUID = parts[2]; // 'uuid' — третий элемент
      const fullImageFolderPath = path.join(__dirname, '..', 'uploads', 'products', folderUUID);
      await deleteFolderRecursive(fullImageFolderPath);
    }

    // Удаление папки инструкции
    if (product.instructionPath) {
      const instructionParts = product.instructionPath.split(path.sep);
      const instructionUUID = instructionParts[2]; // 'uuid' — третий элемент
      const fullInstructionFolderPath = path.join(__dirname, '..', 'uploads', 'files', instructionUUID);
      await deleteFolderRecursive(fullInstructionFolderPath);
    }

    // Удаление продукта из базы
    await ProductModel.findByIdAndDelete(productId);

    return { message: "Продукт успешно удалён" };
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка удаления продукта");
  }
};

//Проверка покупал ли юзер товар 
const checkIfUserBoughtProduct = async (userId, productId) => {
  const order = await OrderModel.findOne({
    user: userId,
    status: 'ready',
    products: {
      $elemMatch: {
        product: productId,
      },
    },
  });

  return !!order;
};

//Проверяем оставлял ли пользовтель отзыв
const checkIfUserLeftReview = async (userId, productId) => {
  const review = await ProductReviewModel.findOne({
    user: userId,
    productId: productId,
  });

  return {
    hasLeftReview: !!review,
  };
};

const getProducts = async (categoryId, selecteValue, showOnMainPage) => {
  try {
    const filter = {};
    const sort = {};

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (showOnMainPage === 'true') {
      filter.showOnMainPage = true;
    }

    // Сортировка
    if (selecteValue) {
      const [field, direction] = selecteValue.split(":"); // ← вместо "_"
      console.log(field, direction);
      
      const sortFieldMap = {
        date: "createdAt",
        price: "priceIndividual",
      };

      if (sortFieldMap[field]) {
        console.log(sortFieldMap[field]);
        sort[sortFieldMap[field]] = direction === "asc" ? 1 : -1;
      }
    }

    return await ProductModel.find(filter).sort(sort);
  } catch (e) {
    throw ApiError.InternalServerError(
      e.message || "Ошибка получения продуктов"
    );
  }
};


const getProductDetails = async (id, userData) => {
  try {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw new Error("Товар не найден");
    }

    // Отзывы на товар
    const reviews = await ProductReviewModel.find({ productId: id, status: "active" }).populate("user", "name");

    // Статусы по умолчанию
    let hasPurchased = false;
    let isUserLeftReview = { hasLeftReview: false };

    // Если юзер авторизован, проверяем его действия
    if (userData?.id) {
      hasPurchased = await checkIfUserBoughtProduct(userData.id, id);
      isUserLeftReview = await checkIfUserLeftReview(userData.id, id);
    }

    return {
      ...product.toObject(),
      hasPurchased,
      isUserLeftReview,
      reviews
    };
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка получения продукта");
  }
};



// ADMIN

// 1. СОЗДАНИЕ ПРОДУКТА
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

// 2. ОБНОВЛЕНИЕ ПРОДУКТА
const editProduct = async (id, productData, files, deletedImages, removeInstruction) => {
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

        try {
          await fs.access(fullPath);
          await fs.unlink(fullPath);
          console.log("Изображение удалено:", fullPath);
        } catch (err) {
          console.warn("Не удалось удалить изображение:", fullPath, err.message);
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

    // Добавление новых изображений
    if (files?.images) {
      const newImages = files.images.map(file => {
        const relativePath = file.path.split("uploads")[1];
        return `uploads${relativePath}`;
      });
      product.images.push(...newImages);
    }

    // Удаление инструкции
    if (removeInstruction === "true" && product.instructionPath) {
      const instructionPath = path.join(__dirname, "..", product.instructionPath);

      try {
        await fs.access(instructionPath);
        await fs.unlink(instructionPath);
        console.log("Инструкция удалена:", instructionPath);
      } catch (err) {
        console.warn("Не удалось удалить инструкцию:", instructionPath, err.message);
      }

      product.instructionPath = null;
    }

    // Добавление новой инструкции
    if (files?.instruction) {
      const instructionFile = files.instruction[0];
      const relativePath = instructionFile.path.split("uploads")[1];
      product.instructionPath = `uploads${relativePath}`;
    }

    await product.save();
    return product;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Ошибка обновления продукта");
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
  editProduct,
  getProductDetails,
  checkIfUserBoughtProduct,
  checkIfUserLeftReview,
  deleteFolderRecursive
};
