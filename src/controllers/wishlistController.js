import {
  addProduct as _addProduct,
  clearWishlist as _clearWishlist,
  getWishlist as _getWishlist,
  isInWishlist as _isInWishlist,
  removeProduct as _removeProduct,
  toggleProduct as _toggleProduct,
  getWishlistCount,
  getWishlistPaginated,
  getWishlistProductIds,
  getWishlistSummary,
} from "../services/wishlistService";

class WishlistController {
  async getWishlist(req, res, next) {
    try {
      const products = await _getWishlist(req.user.id);
      res.json(products);
    } catch (error) {
      next(error);
    }
  }

  async addProduct(req, res, next) {
    try {
      const { productId, notes } = req.body;
      const products = await _addProduct(req.user.id, productId, notes);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async removeProduct(req, res, next) {
    try {
      const { productId } = req.params;
      const products = await _removeProduct(req.user.id, productId);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async clearWishlist(req, res, next) {
    try {
      const products = await _clearWishlist(req.user.id);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async toggleProduct(req, res, next) {
    try {
      const { productId, notes } = req.body;
      const products = await _toggleProduct(req.user.id, productId, notes);

      const exists = products.some((p) => p._id.toString() === productId);
      res.status(200).json({
        products,
        action: exists ? "added" : "removed",
        message: exists
          ? "Товар добавлен в избранное"
          : "Товар удален из избранного",
      });
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req, res, next) {
    try {
      const summary = await getWishlistSummary(req.user.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  async isInWishlist(req, res, next) {
    try {
      const { productId } = req.params;
      const isInWishlist = await _isInWishlist(req.user.id, productId);
      res.json({ isInWishlist });
    } catch (error) {
      next(error);
    }
  }

  async getProductIds(req, res, next) {
    try {
      const productIds = await getWishlistProductIds(req.user.id);
      res.json(productIds);
    } catch (error) {
      next(error);
    }
  }

  async getCount(req, res, next) {
    try {
      const count = await getWishlistCount(req.user.id);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  }

  async getPaginated(req, res, next) {
    try {
      const {
        page = 1,
        limit = 50,
        sortBy = "addedAt",
        sortOrder = "desc",
      } = req.query;

      const result = await getWishlistPaginated(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new WishlistController();
