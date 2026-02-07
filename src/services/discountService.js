const { DiscountModel } = require("../models/index.models");
const ApiError = require("../exceptions/api-error");
const mongoose = require("mongoose");
class DiscountService {
  /**
   * Создание новой скидки
   */
  async createDiscount({ discountData, userId }) {
    try {
      // Проверяем уникальность кода, если он указан
      if (discountData.code) {
        const existingDiscount = await DiscountModel.findOne({
          code: discountData.code,
        });

        if (existingDiscount) {
          throw ApiError.BadRequest("Скидка с таким кодом уже существует");
        }
      }

      // Проверяем даты
      if (!discountData.isUnlimited && discountData.endAt) {
        const startAt = discountData.startAt
          ? new Date(discountData.startAt)
          : new Date();
        const endAt = new Date(discountData.endAt);

        if (endAt <= startAt) {
          throw ApiError.BadRequest(
            "Дата окончания должна быть позже даты начала",
          );
        }
      }

      const discount = new DiscountModel({
        ...discountData,
        createdBy: userId,
        updatedBy: userId,
      });

      await discount.save();

      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка создания скидки:", error);
      throw error;
    }
  }

  /**
   * Обновление скидки
   */
  async updateDiscount({ id, discountData, userId }) {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      // Если меняется код, проверяем уникальность
      if (discountData.code && discountData.code !== discount.code) {
        const existingDiscount = await DiscountModel.findOne({
          code: discountData.code,
          _id: { $ne: id },
        });

        if (existingDiscount) {
          throw ApiError.BadRequest("Скидка с таким кодом уже существует");
        }
      }

      // Проверяем даты
      if (
        discountData.endAt ||
        discountData.startAt ||
        discountData.isUnlimited !== undefined
      ) {
        const isUnlimited =
          discountData.isUnlimited !== undefined
            ? discountData.isUnlimited
            : discount.isUnlimited;

        if (!isUnlimited) {
          const startAt = discountData.startAt
            ? new Date(discountData.startAt)
            : discount.startAt;
          const endAt = discountData.endAt
            ? new Date(discountData.endAt)
            : discount.endAt;

          if (endAt && startAt && endAt <= startAt) {
            throw ApiError.BadRequest(
              "Дата окончания должна быть позже даты начала",
            );
          }
        }
      }

      // Обновляем поля
      Object.keys(discountData).forEach((key) => {
        if (key !== "_id" && key !== "__v") {
          discount[key] = discountData[key];
        }
      });

      discount.updatedBy = userId;
      discount.updatedAt = new Date();

      await discount.save();

      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка обновления скидки:", error);
      throw error;
    }
  }

  /**
   * Получение скидки по ID
   */
  async getDiscountById(id) {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }
      return discount;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка получения скидки:", error);
      throw error;
    }
  }

  /**
   * Получение списка скидок с фильтрацией
   */
  async listDiscounts(filters = {}) {
    try {
      const {
        search,
        type,
        isActive,
        isCurrentlyActive,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = filters;

      const query = {};

      // Поиск по названию или описанию
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
        ];
      }

      // Фильтр по типу
      if (type) {
        query.type = type;
      }

      // Фильтр по активности
      if (isActive !== undefined) {
        query.isActive = isActive === "true" || isActive === true;
      }

      // Фильтр по датам
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Сортировка
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Пагинация
      const skip = (page - 1) * limit;

      const [discounts, total] = await Promise.all([
        DiscountModel.find(query)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate("createdBy", "email name")
          .populate("updatedBy", "email name"),
        DiscountModel.countDocuments(query),
      ]);

      return {
        discounts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка получения списка скидок:",
        error,
      );
      throw error;
    }
  }

  /**
   * Удаление скидки
   */
  async deleteDiscount(id) {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      // Проверяем, использовалась ли скидка
      if (discount.totalUses > 0) {
        throw ApiError.BadRequest(
          "Невозможно удалить скидку, которая уже использовалась. Деактивируйте её вместо удаления.",
        );
      }

      await discount.deleteOne();

      return { success: true, message: "Скидка успешно удалена" };
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка удаления скидки:", error);
      throw error;
    }
  }

  /**
   * Изменение статуса скидки
   */
  async changeDiscountStatus(id, isActive) {
    try {
      const discount = await DiscountModel.findById(id);
      if (!discount) {
        throw ApiError.NotFoundError("Скидка не найдена");
      }

      discount.isActive = isActive;
      discount.updatedAt = new Date();

      await discount.save();

      return discount;
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка изменения статуса скидки:",
        error,
      );
      throw error;
    }
  }

  /**
   * Получение активных скидок для применения к корзине
   */
  async getApplicableDiscounts(cartData) {
    try {
      const now = new Date();
      const discounts = await DiscountModel.find({
        isActive: true,
        startAt: { $lte: now },
        $or: [{ isUnlimited: true }, { endAt: null }, { endAt: { $gte: now } }],
      }).sort({ priority: -1, createdAt: -1 }); // Важно: высокий приоритет первым

      const result = [];

      for (const discount of discounts) {
        const calc = discount.calculateDiscount(cartData);

        result.push({
          discount: {
            _id: discount._id,
            name: discount.name,
            type: discount.type,
            discountPercent: discount.discountPercent,
            minTotalQuantity: discount.minTotalQuantity,
            minTotalAmount: discount.minTotalAmount,
          },
          ...calc,
        });

        if (calc.applicable) break; // Применяем только одну скидку (самую приоритетную)
      }

      return result;
    } catch (error) {
      console.error("[DISCOUNT_SERVICE] Ошибка:", error);
      return [];
    }
  }

  /**
   * Увеличение счетчика использования скидки
   */
  async incrementDiscountUsage(discountId, discountAmount) {
    try {
      if (!discountId || !mongoose.Types.ObjectId.isValid(discountId)) {
        console.warn(
          `[DISCOUNT_SERVICE] Некорректный ID скидки: ${discountId}`,
        );
        return;
      }

      const result = await DiscountModel.findByIdAndUpdate(
        discountId,
        {
          $inc: {
            totalUses: 1,
            totalDiscountAmount: discountAmount || 0,
          },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      );

      if (!result) {
        console.warn(`[DISCOUNT_SERVICE] Скидка с ID ${discountId} не найдена`);
        return;
      }

      console.log(`[DISCOUNT_SERVICE] Счетчик скидки ${discountId} увеличен:`, {
        totalUses: result.totalUses,
        totalDiscountAmount: result.totalDiscountAmount,
      });

      return result;
    } catch (error) {
      console.error(
        "[DISCOUNT_SERVICE] Ошибка увеличения счетчика использования:",
        error,
      );
      // Не выбрасываем ошибку, чтобы не прерывать основной поток создания заказа
      throw error;
    }
  }
}

module.exports = new DiscountService();
