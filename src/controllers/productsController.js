const productService = require("../services/productService");

const getProducts = async (req, res, next) => {
  try {
    const products = await productService.getProducts();
    res.json(products);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getProducts,
};