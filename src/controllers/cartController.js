const ApiError = require("../exceptions/api-error");
const cartService = require("../services/cartService");

class CartController {
  async getCart(req, res, next) {
    try {
      const cart = await cartService.getCart(req.user.id);
      console.log('getCart', cart);
      
      res.json(cart);
    } catch (error) {
      next(error);
    }
  }

  async addOrUpdateItem(req, res, next) {
    try {
      const { productId, quantity } = req.body;
      const cart = await cartService.addOrUpdateItem(req.user.id, productId, quantity);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async removeItem(req, res, next) {
    try {
      const { productId } = req.params;
      const cart = await cartService.removeItem(req.user.id, productId);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async decreaseQuantity(req, res, next) {
    try {
      const { productId } = req.params;
      const cart = await cartService.decreaseQuantity(req.user.id, productId);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async clearCart(req, res, next) {
    try {
      const result = await cartService.clearCart(req.user.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CartController();