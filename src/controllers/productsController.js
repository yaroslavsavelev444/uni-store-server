const ApiError = require("../exceptions/api-error");
const productService = require("../services/productService");

const getProducts = async (req, res, next) => {
  const { categoryId, selectedValue, showOnMainPage } = req.query;
  console.log(categoryId, selectedValue, showOnMainPage);
  
  try {
    const products = await productService.getProducts(categoryId, selectedValue, showOnMainPage);
    res.json(products);
  } catch (e) {
    next(e);
  }
};
const getProductDetails = async (req, res, next) => {
  const { id } = req.query;
  
  if (!id) {
    throw ApiError.BadRequest("Отсутствует productId");
  }
  try {
    const product = await productService.getProductDetails(id, req.user);
    res.json(product);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getProducts,
  getProductDetails
};