const ApiError = require('../exceptions/api-error');
const ContentBlockService = require('../services/contentBlockService');
const auditLogger = require('../logger/auditLogger');

class ContentBlockController {
  constructor() {
    this.contentBlockService = new ContentBlockService();
  }

  // Получение всех блоков
  async getAll(req, res, next) {
    try {
      const { includeInactive } = req.query;
      const items = await this.contentBlockService.getAll(includeInactive === 'true');
      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }

  // Получение блока по ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      if (!id) {
        return next(ApiError.BadRequest("ID блока обязателен"));
      }

      const item = await this.contentBlockService.getById(id);
      if (!item) {
        return next(ApiError.BadRequest("Блок не найден"));
      }

      res.status(200).json(item);
    } catch (err) {
      next(err);
    }
  }

  // Получение блоков по тегу
  async getByTag(req, res, next) {
    try {
      const { tag } = req.params;
      if (!tag || !tag.trim()) {
        return next(ApiError.BadRequest("Тег обязателен"));
      }

      const items = await this.contentBlockService.getByTag(tag);
      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }

  // Создание блока
  async create(req, res, next) {
    try {
      const data = req.body;
      const tempImagePath = data.tempImagePath || null;

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'CREATE_BLOCK_START',
        null,
        [
          { field: 'title', old: null, new: data.title || 'без названия' },
          { field: 'hasImage', old: null, new: !!tempImagePath }
        ],
        `Начало создания контент-блока`
      );

      const item = await this.contentBlockService.create(data, tempImagePath);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'CREATE_BLOCK_SUCCESS',
        {
          id: item._id.toString(),
          email: 'system@contentblock'
        },
        [
          { field: 'id', old: null, new: item._id.toString() },
          { field: 'hasButton', old: null, new: !!item.button?.text },
          { field: 'isActive', old: null, new: item.isActive },
          { field: 'position', old: null, new: item.position }
        ],
        `Создан контент-блок "${item.title}". ID: ${item._id}`
      );

      res.status(201).json(item);
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'CREATE_BLOCK_FAILED',
        null,
        [
          { field: 'error', old: null, new: err.message },
          { field: 'title', old: null, new: req.body.title || 'без названия' }
        ],
        `Ошибка при создании контент-блока: ${err.message}`
      );

      next(err);
    }
  }

  // Обновление блока
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;
      const tempImagePath = data.tempImagePath || null;

      // Получаем текущий блок для аудита
      let itemBefore = null;
      try {
        itemBefore = await this.contentBlockService.getById(id);
      } catch (err) {
        console.warn(`Не удалось получить данные блока ${id} для аудита:`, err.message);
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'UPDATE_BLOCK_START',
        {
          id: id,
          email: 'system@contentblock'
        },
        [
          { field: 'oldTitle', old: null, new: itemBefore?.title || 'неизвестно' },
          { field: 'newTitle', old: null, new: data.title || itemBefore?.title || 'без названия' },
          { field: 'hasNewImage', old: null, new: !!tempImagePath }
        ],
        `Начало обновления контент-блока ${id}`
      );

      const updated = await this.contentBlockService.update(id, data, tempImagePath);

      // Логируем изменения
      const changes = [];
      if (itemBefore) {
        if (itemBefore.title !== updated.title) {
          changes.push({
            field: 'title',
            old: itemBefore.title,
            new: updated.title
          });
        }
        if (itemBefore.subtitle !== updated.subtitle) {
          changes.push({
            field: 'subtitle',
            old: itemBefore.subtitle,
            new: updated.subtitle
          });
        }
        if (itemBefore.isActive !== updated.isActive) {
          changes.push({
            field: 'isActive',
            old: itemBefore.isActive,
            new: updated.isActive
          });
        }
        if (itemBefore.position !== updated.position) {
          changes.push({
            field: 'position',
            old: itemBefore.position,
            new: updated.position
          });
        }
        if (itemBefore.imageUrl !== updated.imageUrl) {
          changes.push({
            field: 'image',
            old: itemBefore.imageUrl ? 'есть' : 'нет',
            new: updated.imageUrl ? 'обновлено' : 'удалено'
          });
        }
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'UPDATE_BLOCK_SUCCESS',
        {
          id: id,
          email: 'system@contentblock'
        },
        changes.length > 0 ? changes : [
          { field: 'updatedAt', old: itemBefore?.updatedAt, new: updated.updatedAt }
        ],
        `Обновлен контент-блок "${updated.title}" (ID: ${id}). Изменений: ${changes.length}`
      );

      res.status(200).json(updated);
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'UPDATE_BLOCK_FAILED',
        {
          id: req.params.id,
          email: 'system@contentblock'
        },
        [
          { field: 'error', old: null, new: err.message },
          { field: 'params', old: null, new: JSON.stringify(req.params) }
        ],
        `Ошибка при обновлении контент-блока ${req.params.id}: ${err.message}`
      );

      next(err);
    }
  }

  // Удаление блока
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // Получаем текущий блок для аудита
      let itemBefore = null;
      try {
        itemBefore = await this.contentBlockService.getById(id);
      } catch (err) {
        console.warn(`Не удалось получить данные блока ${id} для аудита:`, err.message);
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'DELETE_BLOCK_START',
        {
          id: id,
          email: 'system@contentblock'
        },
        [
          { field: 'title', old: null, new: itemBefore?.title || 'неизвестно' },
          { field: 'hasImage', old: null, new: !!(itemBefore?.imageUrl) },
          { field: 'hasButton', old: null, new: !!(itemBefore?.button?.text) }
        ],
        `Начало удаления контент-блока ${id}`
      );

      await this.contentBlockService.delete(id);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'DELETE_BLOCK_SUCCESS',
        {
          id: id,
          email: 'system@contentblock'
        },
        [
          { field: 'status', old: 'активен', new: 'удален' },
          { field: 'deletedBy', old: null, new: req.user.id },
          { field: 'deletedAt', old: null, new: new Date().toISOString() }
        ],
        `Удален контент-блок "${itemBefore?.title || 'неизвестно'}" (ID: ${id})`
      );

      res.status(204).send();
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        'DELETE_BLOCK_FAILED',
        {
          id: req.params.id,
          email: 'system@contentblock'
        },
        [
          { field: 'error', old: null, new: err.message },
          { field: 'params', old: null, new: JSON.stringify(req.params) }
        ],
        `Ошибка при удалении контент-блока ${req.params.id}: ${err.message}`
      );

      next(err);
    }
  }

  // Активация/деактивация блока
  async toggleActive(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return next(ApiError.BadRequest("Поле isActive должно быть boolean"));
      }

      const updated = await this.contentBlockService.toggleActive(id, isActive);

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'CONTENT_BLOCK_MANAGEMENT',
        isActive ? 'ACTIVATE_BLOCK' : 'DEACTIVATE_BLOCK',
        {
          id: id,
          email: 'system@contentblock'
        },
        [
          { field: 'status', old: !isActive, new: isActive }
        ],
        `Контент-блок "${updated.title}" ${isActive ? 'активирован' : 'деактивирован'}`
      );

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }

  // Получение статистики
  async getStats(req, res, next) {
    try {
      const stats = await this.contentBlockService.getStats();
      res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ContentBlockController;