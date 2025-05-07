const ApiError = require("../exceptions/api-error");
const cartService = require("../services/cartService");

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user.id);
    res.json(cart);
  } catch (e) {
    next(e);
  }
};

const setCartItem = async (req, res, next) => {
  try {
    const { id, quantity } = req.body;
    const cart = await cartService.setCartItem(req.user.id, id, quantity);
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
  setCartItem,
  removeFromCartProduct,
  clearCart,
};