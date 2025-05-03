const cartService = require("../services/cartService");

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user.id);
    res.json(cart);
  } catch (e) {
    next(e);
  }
};

const addToCartProduct = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await cartService.addToCartProduct(req.user.id, productId, quantity);
    res.status(200).json(cart);
  } catch (e) {
    next(e);
  }
};

const removeFromCartProduct = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await cartService.removeFromCartProduct(req.user.id, productId, quantity);
    res.status(200).json(cart);
  } catch (e) {
    next(e);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.user.id);
    res.status(200).json(cart);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getCart,
  addToCartProduct,
  removeFromCartProduct,
  clearCart,
};