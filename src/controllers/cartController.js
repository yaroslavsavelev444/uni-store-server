import cartService from "../services/cartService.js";

const {
  addOrUpdateItem: _addOrUpdateItem,
  clearCart: _clearCart,
  decreaseQuantity: _decreaseQuantity,
  getCart: _getCart,
  removeItem: _removeItem,
} = cartService;

class CartController {
  async getCart(req, res, next) {
    try {
      const cart = await _getCart(req.user.id);
      console.log("getCart", JSON.stringify(cart));

      res.json(cart);
    } catch (error) {
      next(error);
    }
  }

  async addOrUpdateItem(req, res, next) {
    try {
      const { productId, quantity } = req.body;
      const cart = await _addOrUpdateItem(req.user.id, productId, quantity);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async removeItem(req, res, next) {
    try {
      const { productId } = req.params;
      const cart = await _removeItem(req.user.id, productId);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async decreaseQuantity(req, res, next) {
    try {
      const { productId } = req.params;
      const cart = await _decreaseQuantity(req.user.id, productId);
      res.status(200).json(cart);
    } catch (error) {
      next(error);
    }
  }

  async clearCart(req, res, next) {
    try {
      const result = await _clearCart(req.user.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new CartController();
