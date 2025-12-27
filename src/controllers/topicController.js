const ApiError = require("../exceptions/api-error");
const TopicService = require("../services/topicService");
const auditLogger = require("../logger/auditLogger");

class TopicController {
  constructor() {
    this.topicService = new TopicService();
  }

  async getAll(req, res, next) {
    try {
      const items = await this.topicService.getAll();
      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }

  async getBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return next(ApiError.BadRequest("Недостаточно данных для получения записи."));
      }
      const item = await this.topicService.getBySlugWithRelated(slug);
      if (!item) {
        return next(ApiError.BadRequest("Запись не найдена."));
      }
      res.status(200).json(item);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const data = req.body;
      
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'CREATE_TOPIC_START',
        null,
        [
          { field: 'title', old: null, new: data.title || 'без названия' },
          { field: 'slug', old: null, new: data.slug || 'без slug' },
          { field: 'filesCount', old: null, new: req.files ? Object.keys(req.files).length : 0 }
        ],
        `Начало создания темы`
      );
      
      const item = await this.topicService.create(data, req.files);
      
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'CREATE_TOPIC_SUCCESS',
        {
          id: item._id.toString(),
          email: 'system@topic'
        },
        [
          { 
            field: 'contentBlocksCount', 
            old: null, 
            new: item.contentBlocks?.length || 0 
          },
          { 
            field: 'createdAt', 
            old: null, 
            new: item.createdAt 
          },
          { 
            field: 'hasCover', 
            old: null, 
            new: !!item.imageUrl 
          }
        ],
        `Создана тема "${item.title}". ID: ${item._id}, slug: ${item.slug}`
      );
      
      res.status(201).json(item);
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'CREATE_TOPIC_FAILED',
        null,
        [
          { field: 'error', old: null, new: err.message },
          { field: 'requestData', old: null, new: JSON.stringify(req.body).slice(0, 500) }
        ],
        `Ошибка при создании темы: ${err.message}`
      );
      
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      let itemBefore = null;
      try {
        itemBefore = await this.topicService.getItemById(id);
      } catch (err) {
        console.warn(`Не удалось получить данные элемента ${id} для аудита:`, err.message);
      }

      if (typeof data.contentBlocks === "string") {
        try {
          data.contentBlocks = JSON.parse(data.contentBlocks);
        } catch {
          await auditLogger.logAdminEvent(
            req.user.id,
            req.user.email,
            req.user.role,
            'TOPIC_CONTENT_MANAGEMENT',
            'UPDATE_TOPIC_INVALID_FORMAT',
            {
              id: id,
              email: 'system@topic'
            },
            [],
            `Неверный формат contentBlocks при обновлении элемента ${id}`
          );
          return next(ApiError.BadRequest("Неверный формат contentBlocks"));
        }
      }

      if (req.files?.cover && req.files.cover.length > 0) {
        const coverFile = req.files.cover[0];
        data.imageUrl = `/uploads/topics/${data.slug}/${coverFile.filename}`;
      }

      if (req.files?.contentImages) {
        const uploadedImages = req.files.contentImages.map(
          f => `/uploads/topics/${data.slug}/${f.filename}`
        );

        if (data.contentBlocks && Array.isArray(data.contentBlocks)) {
          let imgIndex = 0;
          data.contentBlocks = data.contentBlocks.map(block => {
            if (block.type === "image" && block.value === "upload_placeholder") {
              block.value = uploadedImages[imgIndex] || block.value;
              imgIndex++;
            }
            return block;
          });
        }
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'UPDATE_TOPIC_START',
        {
          id: id,
          email: 'system@topic'
        },
        [
          { 
            field: 'oldTitle', 
            old: null, 
            new: itemBefore?.title || 'неизвестно' 
          },
          { 
            field: 'newTitle', 
            old: null, 
            new: data.title || itemBefore?.title || 'без названия' 
          },
          { 
            field: 'filesCount', 
            old: null, 
            new: req.files ? Object.keys(req.files).length : 0 
          }
        ],
        `Начало обновления темы ${id}`
      );

      const updated = await this.topicService.update(id, data);
      
      const changes = [];
      
      if (itemBefore) {
        if (itemBefore.title !== updated.title) {
          changes.push({
            field: 'title',
            old: itemBefore.title,
            new: updated.title
          });
        }
        
        if (itemBefore.slug !== updated.slug) {
          changes.push({
            field: 'slug',
            old: itemBefore.slug,
            new: updated.slug
          });
        }
        
        if (itemBefore.imageUrl !== updated.imageUrl) {
          changes.push({
            field: 'coverImage',
            old: itemBefore.imageUrl ? 'есть' : 'нет',
            new: updated.imageUrl ? 'обновлена' : 'удалена'
          });
        }
        
        const oldBlocksCount = itemBefore.contentBlocks?.length || 0;
        const newBlocksCount = updated.contentBlocks?.length || 0;
        if (oldBlocksCount !== newBlocksCount) {
          changes.push({
            field: 'contentBlocksCount',
            old: oldBlocksCount,
            new: newBlocksCount
          });
        }
      }
      
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'UPDATE_TOPIC_SUCCESS',
        {
          id: id,
          email: 'system@topic'
        },
        changes.length > 0 ? changes : [
          { 
            field: 'updatedAt', 
            old: itemBefore?.updatedAt, 
            new: updated.updatedAt 
          }
        ],
        `Обновлена тема "${updated.title}" (ID: ${id}). Изменений: ${changes.length}`
      );
      
      res.status(200).json(updated);
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'UPDATE_TOPIC_FAILED',
        {
          id: req.params.id,
          email: 'system@topic'
        },
        [
          { field: 'error', old: null, new: err.message },
          { field: 'params', old: null, new: JSON.stringify(req.params) }
        ],
        `Ошибка при обновлении темы ${req.params.id}: ${err.message}`
      );
      
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      
      let itemBefore = null;
      try {
        itemBefore = await this.topicService.getItemById(id);
      } catch (err) {
        console.warn(`Не удалось получить данные элемента ${id} для аудита:`, err.message);
      }

      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'DELETE_TOPIC_START',
        {
          id: id,
          email: 'system@topic'
        },
        [
          { 
            field: 'itemTitle', 
            old: null, 
            new: itemBefore?.title || 'неизвестно' 
          },
          { 
            field: 'itemSlug', 
            old: null, 
            new: itemBefore?.slug || 'неизвестно' 
          },
          { 
            field: 'contentBlocksCount', 
            old: null, 
            new: itemBefore?.contentBlocks?.length || 0 
          }
        ],
        `Начало удаления темы ${id}`
      );

      await this.topicService.deleteItem(id);
      
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'DELETE_TOPIC_SUCCESS',
        {
          id: id,
          email: 'system@topic'
        },
        [
          { 
            field: 'status', 
            old: 'активен', 
            new: 'удален' 
          },
          { 
            field: 'deletedBy', 
            old: null, 
            new: req.user.id 
          },
          { 
            field: 'deletedAt', 
            old: null, 
            new: new Date().toISOString() 
          }
        ],
        `Удалена тема "${itemBefore?.title || 'неизвестно'}" (ID: ${id})`
      );
      
      res.status(204).send();
    } catch (err) {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        'TOPIC_CONTENT_MANAGEMENT',
        'DELETE_TOPIC_FAILED',
        {
          id: req.params.id,
          email: 'system@topic'
        },
        [
          { field: 'error', old: null, new: err.message },
          { field: 'params', old: null, new: JSON.stringify(req.params) }
        ],
        `Ошибка при удалении темы ${req.params.id}: ${err.message}`
      );
      
      next(err);
    }
  }
}

module.exports = TopicController;