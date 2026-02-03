const ApiError = require("../exceptions/api-error");
const wishlistService = require("../services/wishlistService");

class WishlistController {
  async getWishlist(req, res, next) {
    try {
      const products = await wishlistService.getWishlist(req.user.id);
      res.json(products);
    } catch (error) {
      next(error);
    }
  }

  async addProduct(req, res, next) {
    try {
      const { productId, notes } = req.body;
      const products = await wishlistService.addProduct(req.user.id, productId, notes);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async removeProduct(req, res, next) {
    try {
      const { productId } = req.params;
      const products = await wishlistService.removeProduct(req.user.id, productId);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async clearWishlist(req, res, next) {
    try {
      const products = await wishlistService.clearWishlist(req.user.id);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async toggleProduct(req, res, next) {
    try {
      const { productId, notes } = req.body;
      const products = await wishlistService.toggleProduct(req.user.id, productId, notes);
      
      const exists = products.some(p => p._id.toString() === productId);
      res.status(200).json({
        products,
        action: exists ? 'added' : 'removed',
        message: exists ? 'Товар добавлен в избранное' : 'Товар удален из избранного'
      });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req, res, next) {
    try {
      const summary = await wishlistService.getWishlistSummary(req.user.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  async isInWishlist(req, res, next) {
    try {
      const { productId } = req.params;
      const isInWishlist = await wishlistService.isInWishlist(req.user.id, productId);
      res.json({ isInWishlist });
    } catch (error) {
      next(error);
    }
  }

  async getProductIds(req, res, next) {
    try {
      const productIds = await wishlistService.getWishlistProductIds(req.user.id);
      res.json(productIds);
    } catch (error) {
      next(error);
    }
  }

  async getCount(req, res, next) {
    try {
      const count = await wishlistService.getWishlistCount(req.user.id);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  }

  async getPaginated(req, res, next) {
    try {
      const { page = 1, limit = 50, sortBy = 'addedAt', sortOrder = 'desc' } = req.query;
      
      const result = await wishlistService.getWishlistPaginated(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder
      });
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WishlistController();