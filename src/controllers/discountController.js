const discountService = require("../services/discountService");
const ApiError = require("../exceptions/api-error");
const mongoose = require("mongoose");
class DiscountController {
  /**
   * Создание скидки
   */
  async create(req, res, next) {
    try {
      const discountData = req.body;
      const userId = req.user.id;

      // Валидация обязательных полей
      if (!discountData.name || !discountData.discountPercent) {
        throw ApiError.BadRequest("Название и процент скидки обязательны");
      }

      // Для quantity_based скидки проверяем minTotalQuantity
      if (
        discountData.type === "quantity_based" &&
        !discountData.minTotalQuantity
      ) {
        throw ApiError.BadRequest(
          "Минимальное количество товаров обязательно для quantity_based скидки",
        );
      }

      const discount = await discountService.createDiscount({
        discountData,
        userId,
      });

      res.status(201).json(discount);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Обновление скидки
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const discountData = req.body;
      const userId = req.user.id;

      const discount = await discountService.updateDiscount({
        id,
        discountData,
        userId,
      });

      res.json(discount);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение скидки по ID
   */
  async getById(req, res, next) {
    try {
      const discount = await discountService.getDiscountById(req.params.id);
      res.json(discount);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение списка скидок
   */
  async getAll(req, res, next) {
    try {
      const result = await discountService.listDiscounts(req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Удаление скидки
   */
  async remove(req, res, next) {
    try {
      const result = await discountService.deleteDiscount(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Изменение статуса скидки
   */
  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        throw ApiError.BadRequest("Поле isActive должно быть boolean");
      }

      const discount = await discountService.changeDiscountStatus(id, isActive);
      res.json(discount);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение скидок для корзины (для пользователя)
   */
  async getForCart(req, res, next) {
    try {
      const { cartId } = req.body;

      if (!cartId || !mongoose.Types.ObjectId.isValid(cartId)) {
        throw ApiError.BadRequest("Некорректный ID корзины");
      }

      const applicableDiscounts =
        await discountService.getApplicableDiscounts(cartId);

      res.json({
        discounts: applicableDiscounts,
        totalApplicable: applicableDiscounts.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DiscountController();
