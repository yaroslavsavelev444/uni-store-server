const ApiError = require("../exceptions/api-error");
const productService = require("../services/productService");
const userService = require("../services/userService");
const reviewService = require("../services/reviewService");
const companyService = require("../services/companyService");
const ordersService = require("../services/ordersService");
const categoryService = require("../services/categoryService");
const contactsService = require("../services/contactsService");
const path = require("path");
const fs = require("fs");
const orgService = require("../services/orgService");
//PRODUCT
const createProduct = async (req, res, next) => {
  console.log(req);

  try {
    const { productData } = req.body;
    const { files } = req;
    console.log(productData, files);
    if (!productData || !req.files) {
      throw ApiError.BadRequest("Отсутствует productData");
    }

    const result = await productService.createProduct(productData, files);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const editProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productData, deletedImages, removeInstruction } = req.body;

    if (!id || !productData) {
      throw ApiError.BadRequest("Отсутствует productData");
    }

    const result = await productService.editProduct(
      id,
      productData,
      deletedImages,
      removeInstruction,
      req.files
    );
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      throw ApiError.BadRequest("Отсутствует productId");
    }
    const result = await productService.deleteProduct(productId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const archieveProduct = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      throw ApiError.BadRequest("Отсутствует productId");
    }
    const result = await productService.archieveProduct(productId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
const uploadProductFile = async (req, res, next) => {
  try {
    const file = req.file; // Получаем файл из запроса
    if (!file) {
      throw ApiError.BadRequest("Отсутствует file");
    }
    const result = await productService.uploadProductFile(file);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
const updateProductData = async (req, res, next) => {
  try {
    const { productData } = req.body;
    if (!productData) {
      throw ApiError.BadRequest("Отсутствует productData");
    }
    const result = await productService.updateProductData(productData);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//COMPANY
const uploadOrgData = async (req, res, next) => {
  try {
    console.log(req.body);
    console.log(req.file);
    console.log(req.uploadPath);
    console.log(req.savedFilename);

    const { companyName, workTime, address, phone, email, description } =
      req.body;

    if (!req.file || !req.uploadPath || !req.savedFilename) {
      throw ApiError.BadRequest("Изображение не было загружено");
    }

    if (
      !companyName ||
      !workTime ||
      !address ||
      !phone ||
      !email ||
      !description
    ) {
      console.log(companyName, workTime, address, phone, email, description);
      throw ApiError.BadRequest("Заполните все обязательные поля");
    }

    const imagePath = path
      .join(req.uploadPath, req.savedFilename)
      .replace(/\\/g, "/");

    const companyData = {
      logo: imagePath,
      companyName,
      workTime,
      address,
      phone,
      email,
      description,
    };

    console.log("Создание компании с логотипом:", imagePath);

    const result = await orgService.uploadOrgData(companyData);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const editOrgData = async (req, res, next) => {
  try {
    const orgData = JSON.parse(req.body.productData); // ← исправлено
    if (!orgData || !orgData._id) {
      throw ApiError.BadRequest("Отсутствует ID компании");
    }

    const existingOrg = await orgService.findById(orgData._id);
    if (!existingOrg) {
      throw ApiError.NotFoundError("Компания не найдена");
    }

    const updatedOrg = await orgService.updateOrgWithImage(
      orgData._id,
      orgData,
      req.file,
      req.uploadPath,
      req.savedFilename,
      existingOrg.image
    );

    res.status(200).json(updatedOrg);
  } catch (e) {
    next(e);
  }
};

const deleteOrgData = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw ApiError.BadRequest("Отсутствует companyData");
    }
    const result = await orgService.deleteOrgData(id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const uploadOrgFiles = async (req, res, next) => {
  try {
    const files = req.files;
    const orgId = req.params.orgId;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Файлы не были загружены" });
    }

    const filesData = files.map((file, index) => ({
      path: path.join(req.uploadPath, file.filename).replace(/\\/g, "/"),
      displayName: req.displayNames?.[index] || file.originalname,
    }));

    const result = await orgService.uploadOrgFiles(filesData, orgId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteOrgFile = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { filePath } = req.body;

    if (!orgId || !filePath) {
      throw ApiError.BadRequest("orgId и filePath обязательны");
    }

    const result = await orgService.deleteOrgFile(orgId, filePath);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const addOrgSocialLinks = async (req, res, next) => {
  try {
    const companyId = req.params.orgId;
    const { url } = req.body;
    const icons = req.files;

    if (!url || !icons) {
      throw ApiError.BadRequest("Отсутствует socialLinks");
    }
    const result = await orgService.addOrgSocialLinks(companyId, url, icons);
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
const toggleAssignAdminRules = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      throw ApiError.BadRequest("Отсутствует userId");
    }
    const result = await userService.assignAdminRules(userId);
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
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      throw ApiError.BadRequest("Отсутствует orderId");
    }

    const result = await ordersService.updateOrderStatus(orderId, status);
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

const clearCategory = async (req, res, next) => {
  const { categoryId } = req.body;
  try {
    const result = await categoryService.clearCategory(categoryId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//CONTACTS

const getContacts = async (req, res, next) => {
  try {
    const result = await contactsService.getContacts();
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const updateContactStatus = async (req, res, next) => {
  try {
    const { contactId, status } = req.body;
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
const getOrgReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getOrgReviews(req.user);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}
const getReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getReviews();
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
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

const updateOrgReviewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !status) {
      console.log(id, action);
      
      throw ApiError.BadRequest("Отсутствует status");
    }

    const result = await reviewService.updateOrgReviewStatus(id, status);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  deleteProduct,
  updateReviewStatus,
  updateOrgReviewStatus,
  createProduct,
  deleteOrgFile,
  archieveProduct,
  updateProductData,
  toggleAssignAdminRules,
  deleteUser,
  updateOrderStatus,
  uploadProductFile,
  deleteUploadedFile,
  createCategory,
  deleteCategory,
  changeCategoryData,
  clearCategory,
  updateContactStatus,
  uploadOrderFile,
  getUsers,
  createCategory,
  updateCategory,
  editProduct,
  editOrgData,
  getContacts,
  deleteOrgData,
  uploadOrgData,
  getOrders,
  cancelOrder,
  uploadOrgFiles,
  addOrgSocialLinks,
  deleteOrderFile,
  getReviews,
  getOrgReviews
};
