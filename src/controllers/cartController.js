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

const deleteItem = async (req, res, next) => {
  try {
    const { id } = req.body;
    if(!id) {
      throw ApiError.BadRequest("Отсутствует id");
    }
    const cart = await cartService.deleteItem(req.user.id, id);
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
  deleteItem,
  clearCart,
};