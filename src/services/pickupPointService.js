// services/delivery/pickup-point.service.js
const ApiError = require("../exceptions/api-error");
const { PickupPointModel } = require("../models/index.models");
const DeliveryCacheService = require("../cache-service/delivery-cache.service");
const logger = require("../logger/logger");

class PickupPointService {
  constructor() {
    this.cache = DeliveryCacheService;
  }

  /**
   * Получить все активные пункты самовывоза
   */
  async getAllPickupPoints(includeInactive = false) {
    try {
      // Пробуем получить из кеша
      const cached = await this.cache.getPickupPoints();
      if (cached && !includeInactive) {
        return cached;
      }

      const query = includeInactive ? {} : { isActive: true };
      
      const points = await PickupPointModel.find(query)
        .sort({ isMain: -1, orderIndex: 1, createdAt: -1 })
        .lean();

      // Сохраняем в кеш только активные пункты
      if (!includeInactive) {
        await this.cache.setPickupPoints(points);
      }

      return points;
    } catch (error) {
      logger.error('[PickupPointService] Error getting pickup points:', error);
      throw ApiError.DatabaseError('Ошибка при получении пунктов самовывоза');
    }
  }

  /**
   * Получить главный пункт самовывоза
   */
  async getMainPickupPoint() {
    try {
      const point = await PickupPointModel.findOne({ 
        isMain: true, 
        isActive: true 
      }).lean();

      return point;
    } catch (error) {
      logger.error('[PickupPointService] Error getting main pickup point:', error);
      throw ApiError.DatabaseError('Ошибка при получении главного пункта самовывоза');
    }
  }

  /**
   * Получить пункт самовывоза по ID
   */
  async getPickupPointById(id) {
    try {
      const point = await PickupPointModel.findById(id).lean();
      
      if (!point) {
        throw ApiError.NotFound('Пункт самовывоза не найден');
      }

      return point;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('[PickupPointService] Error getting pickup point by id:', error);
      throw ApiError.DatabaseError('Ошибка при получении пункта самовывоза');
    }
  }

  /**
   * Создать новый пункт самовывоза
   */
  async createPickupPoint(data, userId) {
    try {
      const pointData = {
        ...data,
        createdBy: userId,
        updatedBy: userId
      };

      // Если это первый пункт, делаем его главным
      const count = await PickupPointModel.countDocuments();
      if (count === 0) {
        pointData.isMain = true;
      }

      const point = new PickupPointModel(pointData);
      await point.save();

      // Инвалидируем кеш
      await this.cache.invalidatePickupPoints();

      logger.info(`[PickupPointService] Pickup point created: ${point.name} by user ${userId}`);

      return point.toObject();
    } catch (error) {
      logger.error('[PickupPointService] Error creating pickup point:', error);
      
      if (error.code === 11000) {
        throw ApiError.Conflict('Пункт самовывоза с таким именем уже существует');
      }
      
      throw ApiError.DatabaseError('Ошибка при создании пункта самовывоза');
    }
  }

  /**
   * Обновить пункт самовывоза
   */
  async updatePickupPoint(id, data, userId) {
    try {
      const point = await PickupPointModel.findById(id);
      
      if (!point) {
        throw ApiError.NotFound('Пункт самовывоза не найден');
      }

      // Обновляем поля
      Object.keys(data).forEach(key => {
        if (key !== '_id' && key !== '__v') {
          point[key] = data[key];
        }
      });

      point.updatedBy = userId;
      await point.save();

      // Инвалидируем кеш
      await this.cache.invalidatePickupPoints();

      logger.info(`[PickupPointService] Pickup point updated: ${point.name} by user ${userId}`);

      return point.toObject();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('[PickupPointService] Error updating pickup point:', error);
      throw ApiError.DatabaseError('Ошибка при обновлении пункта самовывоза');
    }
  }

  /**
   * Удалить пункт самовывоза
   */
  async deletePickupPoint(id, userId) {
    try {
      const point = await PickupPointModel.findById(id);
      
      if (!point) {
        throw ApiError.NotFound('Пункт самовывоза не найден');
      }

      // Если удаляем главный пункт, назначаем новый главный
      if (point.isMain) {
        const nextPoint = await PickupPointModel.findOne({ 
          _id: { $ne: id }, 
          isActive: true 
        }).sort({ orderIndex: 1 });

        if (nextPoint) {
          nextPoint.isMain = true;
          await nextPoint.save();
        }
      }

      await PickupPointModel.findByIdAndDelete(id);

      // Инвалидируем кеш
      await this.cache.invalidatePickupPoints();

      logger.info(`[PickupPointService] Pickup point deleted: ${point.name} by user ${userId}`);

      return { success: true, message: 'Пункт самовывоза удален' };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('[PickupPointService] Error deleting pickup point:', error);
      throw ApiError.DatabaseError('Ошибка при удалении пункта самовывоза');
    }
  }

  /**
   * Изменить статус активности
   */
  async togglePickupPointStatus(id, userId) {
    try {
      const point = await PickupPointModel.findById(id);
      
      if (!point) {
        throw ApiError.NotFound('Пункт самовывоза не найден');
      }

      point.isActive = !point.isActive;
      point.updatedBy = userId;
      await point.save();

      // Если деактивируем главный пункт, назначаем новый
      if (!point.isActive && point.isMain) {
        const nextPoint = await PickupPointModel.findOne({ 
          _id: { $ne: id }, 
          isActive: true 
        }).sort({ orderIndex: 1 });

        if (nextPoint) {
          nextPoint.isMain = true;
          await nextPoint.save();
        }
      }

      // Инвалидируем кеш
      await this.cache.invalidatePickupPoints();

      logger.info(`[PickupPointService] Pickup point status toggled: ${point.name} to ${point.isActive} by user ${userId}`);

      return point.toObject();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('[PickupPointService] Error toggling pickup point status:', error);
      throw ApiError.DatabaseError('Ошибка при изменении статуса пункта самовывоза');
    }
  }

  /**
   * Сделать пункт главным
   */
  async setAsMainPickupPoint(id, userId) {
    try {
      const point = await PickupPointModel.findById(id);
      
      if (!point) {
        throw ApiError.NotFound('Пункт самовывоза не найден');
      }

      if (!point.isActive) {
        throw ApiError.BadRequest('Нельзя сделать неактивный пункт главным');
      }

      // Сбрасываем isMain у всех пунктов
      await PickupPointModel.updateMany(
        { _id: { $ne: id } },
        { isMain: false }
      );

      // Устанавливаем выбранный пункт как главный
      point.isMain = true;
      point.updatedBy = userId;
      await point.save();

      // Инвалидируем кеш
      await this.cache.invalidatePickupPoints();

      logger.info(`[PickupPointService] Pickup point set as main: ${point.name} by user ${userId}`);

      return point.toObject();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('[PickupPointService] Error setting pickup point as main:', error);
      throw ApiError.DatabaseError('Ошибка при установке главного пункта');
    }
  }

  /**
   * Обновить порядок пунктов
   */
  async updatePickupPointsOrder(orderedIds, userId) {
    try {
      const session = await mongoose.startSession();
      
      try {
        session.startTransaction();

        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          await PickupPointModel.findByIdAndUpdate(
            id,
            { 
              orderIndex: i,
              updatedBy: userId
            },
            { session }
          );
        }

        await session.commitTransaction();

        // Инвалидируем кеш
        await this.cache.invalidatePickupPoints();

        logger.info(`[PickupPointService] Pickup points order updated by user ${userId}`);

        return { success: true, message: 'Порядок пунктов обновлен' };
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      logger.error('[PickupPointService] Error updating pickup points order:', error);
      throw ApiError.DatabaseError('Ошибка при обновлении порядка пунктов');
    }
  }
}

module.exports = new PickupPointService();