const ApiError = require("../exceptions/api-error");
const productService = require("../services/productService");
const userService = require("../services/userService");
const reviewService = require("../services/reviewService");
const companyService = require("../services/companyService");
const ordersService = require("../services/ordersService");
const categoryService = require("../services/categoryService");
const contactsService = require("../services/contactsService");
const promoBlockService =require("../services/promoBlockService");
const path = require("path");
const { log } = require("console");
//PRODUCT
const createProduct = async (req, res, next) => {
  console.log(req);

  try {
    const { productData } = req.body;
    const { files } = req;
    
    if (!productData || !req.files) {
      throw ApiError.BadRequest("Отсутствует productData");
    }

    const result = await productService.createProduct(productData, files);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};


//USERS
const getUsers = async (req, res, next) => {
  try {
    const result = await userService.getUsers(req.user.id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.body;

    if (!id) {
      throw ApiError.BadRequest("Отсутствует userId");
    }
    
    const result = await userService.updateUserRole(id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      throw ApiError.BadRequest("Отсутствует userId");
    }
    const result = await userService.deleteUser(userId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//ORDERS

const getOrders = async (req, res, next) => {
  try {
    const result = await ordersService.getOrdersAdmin();
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      throw ApiError.BadRequest("Отсутствует orderId");
    }
    const result = await ordersService.getOrderAdmin(orderId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      throw ApiError.BadRequest("Отсутствует orderId");
    } 
    
    const userId = req.user.id;

    if (!userId) {
      throw ApiError.UnauthorizedError("Токены не предоставлены");
    }

    const result = await ordersService.updateOrderStatus(orderId, status, userId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const uploadOrderFile = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const file = req.file;

    if (!file || !orderId) {
      return res.status(400).json({ message: "Файл не был загружен" });
    }

    const fileData = {
      path: path.join(req.uploadPath, file.filename).replace(/\\/g, "/"),
      name: req.displayName || file.originalname,
    };

    const result = await ordersService.uploadOrderFile(fileData, orderId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteOrderFile = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      throw ApiError.BadRequest("orderId и filePath обязательны");
    }

    const result = await ordersService.deleteOrderFile(orderId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteUploadedFile = async (req, res, next) => {
  try {
    const { fileId } = req.body;
    if (!fileId) {
      throw ApiError.BadRequest("Отсутствует fileId");
    }
    const result = await productService.deleteUploadedFile(fileId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { id, text } = req.body;

    if (!id || !text) {
      throw ApiError.BadRequest("Отсутствует orderId");
    }
    const result = await ordersService.cancelOrderAdmin(id, text);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//CATEGORIES
const createCategory = async (req, res, next) => {
  console.log(req);
  try {
    const { title, subTitle, description } = req.body;

    if (!req.file || !req.uploadPath || !req.savedFilename) {
      throw ApiError.BadRequest("Изображение не было загружено");
    }

    const imagePath = path
      .join(req.uploadPath, req.savedFilename)
      .replace(/\\/g, "/"); // для Windows

    const categoryData = {
      title,
      subTitle,
      description,
      image: imagePath,
    };

    const result = await categoryService.createCategory(categoryData);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subTitle, description } = req.body;

    const existingCategory = await categoryService.findById(id);
    if (!existingCategory) {
      throw ApiError.NotFoundError("Категория не найдена");
    }

    let updatedData = { title, subTitle, description };

    // Передаем обновление с удалением старой папки (если изображение обновлено)
    const updatedCategory = await categoryService.updateCategoryWithImage(
      id,
      updatedData,
      req.file,
      req.uploadPath,
      req.savedFilename,
      existingCategory.image
    );

    res.status(200).json(updatedCategory);
  } catch (e) {
    next(e);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw ApiError.BadRequest("Отсутствует categoryId");
    }
    const result = await categoryService.deleteCategory(id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
const changeCategoryData = async (req, res, next) => {
  try {
    const { categoryData } = req.body;
    if (!categoryData) {
      throw ApiError.BadRequest("Отсутствует categoryData");
    }
    const result = await categoryService.changeCategory(categoryData);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};


//CONTACTS

const updateContactStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { contactId} = req.params;

    if (!contactId || !status) {
      throw ApiError.BadRequest("Отсутствует contactData");
    }

    const result = await contactsService.updateContactStatus(contactId, status);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//REVIEWS
const getProductReviews = async (req, res, next) => {
  try {
    const { id } = req.params;
    if(!id) {
      throw ApiError.BadRequest("Отсутствует id");
    }
    const result = await reviewService.getProductReviews(id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const getProductsReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getProductsReviews();
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}
const updateReviewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!id || !action) {
      throw ApiError.BadRequest("Отсутствует reviewData");
    }

    const result = await reviewService.updateReviewStatus(id, action);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};



const addPromoBlock = async (req, res, next) => {
 try {
    const { title, subtitle, page, reversed = false, link } = req.body;
    const image = req.file?.filename;

    if (!image) {
      return ApiError.BadRequest("Изображение не было загружено");
    }

    if(!title || !subtitle || !page) {
      return ApiError.BadRequest("Отсутствует title, subtitle или productId");
    }

    const newBlock = await promoBlockService.createPromoBlock({
      title,
      subtitle,
      image: `/uploads/promo-blocks/${image}`, // путь до картинки
      reversed,
      link,
      page
    });

    res.status(201).json(newBlock);
  } catch (err) {
    console.error(err);
    next(err);
  }
};

const getPromoBlock = async (req, res, next) => {
  const {page} = req.query
  try {
    const result = await promoBlockService.getPromoBlock(page);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const updatePromoBlock = async (req, res, next) => {
  try {
    const { title, subtitle, reversed, page, link } = req.body;
    const id = req.params.id;
    const image = req.file?.filename;

    const updateData = {
      title,
      subtitle,
      reversed,
      page,
      link,
    };

    if (image) {
      updateData.image = `/uploads/promo-blocks/${image}`;
    }

    const updated = await promoBlockService.updatePromoBlock(id, updateData);
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};

const deletePromoBlock = async (req, res, next) => {
  try {
    const id = req.params.id;
    if(!id) {
      return ApiError.BadRequest("Отсутствует id");
    }
    const deleted = await promoBlockService.deletePromoBlock(id);
    
    res.status(200).json(deleted);
  } catch (err) {
    next(err);
  }
};

const addMainMaterial = async (req, res, next) => {
  try {
    const { caption } = req.body;
    const file = req.file;

    if (!file || !caption) {
      return next(ApiError.BadRequest("Отсутствует файл или подпись"));
    }

    const mediaType = file.mimetype.startsWith("video/") ? "video" : "image";

    const newMaterial = await promoBlockService.createMainMaterial({
      caption,
      mediaType,
      mediaUrl: `/uploads/main-materials/${file.filename}`,
    });

    res.status(201).json(newMaterial);
  } catch (e) {
    next(e);
  }
};

const updateMainMaterial = async (req, res, next) => {
  try {
    const { caption } = req.body;
    const { id } = req.params;
    const file = req.file;

    const updateData = { caption };

    if (file) {
      updateData.mediaType = file.mimetype.startsWith("video/") ? "video" : "image";
      updateData.mediaUrl = `/uploads/main-materials/${file.filename}`;
    }

    const updated = await promoBlockService.updateMainMaterial(id, updateData);
    res.status(200).json(updated);
  } catch (e) {
    next(e);
  }
};

const deleteMainMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(ApiError.BadRequest("Не передан ID"));
    const deleted = await promoBlockService.deleteMainMaterial(id);
    res.status(200).json(deleted);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  updateReviewStatus,
  createProduct,
  updateUserRole,
  deleteUser,
  updateOrderStatus,
  deleteUploadedFile,
  createCategory,
  deleteCategory,
  changeCategoryData,
  updateContactStatus,
  uploadOrderFile,
  getUsers,
  createCategory,
  updateCategory,
  getOrders,
  cancelOrder,
  deleteOrderFile,
  getProductReviews,
  addPromoBlock,
  getPromoBlock,
  updatePromoBlock,
  deletePromoBlock,
  addMainMaterial,
  updateMainMaterial,
  deleteMainMaterial,
  getProductsReviews
};
