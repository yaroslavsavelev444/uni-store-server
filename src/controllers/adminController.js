const ApiError = require("../exceptions/api-error");
const productService = require("../services/productService");
const userService = require("../services/userService");
const reviewService = require("../services/reviewService");
const companyService = require("../services/companyService");
const orderService = require("../services/orderService");
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
        
        const {
          companyName,
          workTime,
          address,
          phone,
          email,
          description
        } = req.body;

      if (!req.file || !req.uploadPath || !req.savedFilename) {
        throw ApiError.BadRequest("Изображение не было загружено");
      }
  
      if (!companyName || !workTime || !address || !phone || !email || !description) {
        console.log(companyName, workTime, address, phone, email, description);
        throw ApiError.BadRequest("Заполните все обязательные поля");
      }
  
      const imagePath = path.join(req.uploadPath, req.savedFilename).replace(/\\/g, "/");
  
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
        throw ApiError.NotFound("Компания не найдена");
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

//USERS
const getUsers = async (req, res, next) => {
  try {
    const result = await userService.getUsers();
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
const changeStatusOrder = async (req, res, next) => {
  try {
    const { orderId, text, status } = req.body;
    if (!orderId || !status) {
      throw ApiError.BadRequest("Отсутствует orderId");
    }
    const result = await orderService.changeStatusOrder(orderId, text, status);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const uploadOrderFile = async (req, res, next) => {
  try {
    const { file } = req.body;
    if (!file) {
      throw ApiError.BadRequest("Отсутствует file");
    }
    const result = await orderService.uploadOrderFile(file);
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
      throw ApiError.NotFound("Категория не найдена");
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

const deleteContact = async (req, res, next) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      throw ApiError.BadRequest("Отсутствует contactId");
    }
    const result = await contactsService.deleteContact(contactId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

//REVIEWS

const submitReview = async (req, res, next) => {
  try {
    const { reviewId, status } = req.body;
    if (!reviewId || !status) {
      throw ApiError.BadRequest("Отсутствует reviewData");
    }
    const result = await reviewService.submitReviewService(reviewId, status);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const { reviewId } = req.body;
    if (!reviewId) {
      throw ApiError.BadRequest("Отсутствует reviewId");
    }
    const result = await reviewService.deleteReviewService(reviewId);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  deleteProduct,
  deleteReview,
  submitReview,
  createProduct,
  archieveProduct,
  updateProductData,
  toggleAssignAdminRules,
  deleteUser,
  changeStatusOrder,
  uploadProductFile,
  deleteUploadedFile,
  createCategory,
  deleteCategory,
  changeCategoryData,
  clearCategory,
  deleteContact,
  uploadOrderFile,
  getUsers,
  createCategory,
  updateCategory,
  editProduct,
  editOrgData,

  deleteOrgData,
  uploadOrgData
};
