const ApiError = require("../exceptions/api-error");
const { BannerViewModel, BannerModel } = require("../models/index.models");

class BannerStatsService {
  /**
   * Получает информацию о баннере с проверкой доступности
   */
  async getBannerInfo(bannerId) {
    const now = new Date();
    
    const banner = await BannerModel.findOne({
      _id: bannerId,
      $or: [
        { status: "active" },
        { status: "draft" } // Можно учитывать и черновики для тестирования
      ],
      $or: [
        { startAt: { $exists: false } },
        { startAt: null },
        { startAt: { $lte: now } }
      ],
      $or: [
        { endAt: { $exists: false } },
        { endAt: null },
        { endAt: { $gte: now } }
      ]
    }).lean();

    if (!banner) {
      throw ApiError.NotFoundError("Баннер не найден или не активен");
    }

    return banner;
  }

  /**
   * Проверяет, существует ли запись о просмотре
   */
  async getExistingView(userId, bannerId) {
    return await BannerViewModel.findOne({ userId, bannerId }).lean();
  }

  /**
   * Помечает баннер как просмотренный
   */
  async markViewed(userId, bannerId) {
    // Проверяем баннер
    await this.getBannerInfo(bannerId);

    const now = new Date();
    
    // Проверяем существующую запись
    const existing = await this.getExistingView(userId, bannerId);
    
    if (existing && existing.viewedAt) {
      // Если уже просмотрено, возвращаем существующую запись
      return { 
        action: 'already_viewed', 
        view: existing 
      };
    }

    // Создаем или обновляем запись
    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      { 
        $setOnInsert: { 
          userId, 
          bannerId,
          viewedAt: now,
          createdAt: now
        },
        $set: {
          // Обновляем viewedAt даже если запись существует
          viewedAt: now
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );

    return { 
      action: existing ? 'viewed_updated' : 'viewed_created', 
      view: result 
    };
  }

  /**
   * Помечает баннер как кликнутый
   */
  async markClicked(userId, bannerId) {
    // Проверяем баннер
    await this.getBannerInfo(bannerId);

    const now = new Date();
    
    // Проверяем существующую запись
    const existing = await this.getExistingView(userId, bannerId);
    
    if (!existing) {
      throw ApiError.BadRequest("Нельзя кликнуть непросмотренный баннер");
    }

    if (existing.clicked) {
      // Если уже кликнуто, возвращаем существующую запись
      return { 
        action: 'already_clicked', 
        view: existing 
      };
    }

    // Обновляем запись
    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      { 
        $set: { 
          clicked: true,
          clickedAt: now, // Добавляем время клика
          // Обновляем viewedAt если его нет
          ...(!existing.viewedAt && { viewedAt: now })
        }
      },
      { new: true }
    );

    return { 
      action: 'clicked', 
      view: result 
    };
  }

  /**
   * Помечает баннер как отклоненный
   */
  async markDismissed(userId, bannerId) {
    // Проверяем баннер
    await this.getBannerInfo(bannerId);

    const now = new Date();
    
    // Проверяем существующую запись
    const existing = await this.getExistingView(userId, bannerId);
    
    if (!existing) {
      throw ApiError.BadRequest("Нельзя отклонить непросмотренный баннер");
    }

    if (existing.dismissed) {
      // Если уже отклонено, возвращаем существующую запись
      return { 
        action: 'already_dismissed', 
        view: existing 
      };
    }

    // Обновляем запись
    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      { 
        $set: { 
          dismissed: true,
          dismissedAt: now, // Добавляем время отклонения
          // Обновляем viewedAt если его нет
          ...(!existing.viewedAt && { viewedAt: now })
        }
      },
      { new: true }
    );

    return { 
      action: 'dismissed', 
      view: result 
    };
  }

  /**
   * Комбинированный метод для клика с автоматическим просмотром
   * (если пользователь кликнул сразу без явного просмотра)
   */
  async markViewedAndClicked(userId, bannerId) {
    // Проверяем баннер
    await this.getBannerInfo(bannerId);

    const now = new Date();
    
    // Проверяем существующую запись
    const existing = await this.getExistingView(userId, bannerId);
    
    if (existing && existing.clicked) {
      return { 
        action: 'already_clicked', 
        view: existing 
      };
    }

    // Создаем/обновляем запись с просмотром и кликом
    const result = await BannerViewModel.findOneAndUpdate(
      { userId, bannerId },
      { 
        $setOnInsert: { 
          userId, 
          bannerId,
          createdAt: now
        },
        $set: { 
          viewedAt: now,
          clicked: true,
          clickedAt: now
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );

    return { 
      action: existing ? 'viewed_and_clicked' : 'created_viewed_and_clicked', 
      view: result 
    };
  }
}

module.exports = new BannerStatsService();