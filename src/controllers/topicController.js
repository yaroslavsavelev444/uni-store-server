const ApiError = require("../exceptions/api-error");
const infoService = require("../services/topicService");
const auditLogger = require("../logger/auditLogger");
const getAll = async (req, res, next) => {
  try {
    const items = await infoService.getAll();
    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
};

const getBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      return next(ApiError.BadRequest("Недостаточно данных для получения записи."));
    }
    const item = await infoService.getBySlugWithRelated(slug);
    if (!item) {
      return next(ApiError.BadRequest("Запись не найдена."));
    }
    res.status(200).json(item);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = req.body;
    
    // Логирование начала создания информационного блока
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'CREATE_INFO_START',
      null,
      [
        { field: 'title', old: null, new: data.title || 'без названия' },
        { field: 'slug', old: null, new: data.slug || 'без slug' },
        { field: 'filesCount', old: null, new: req.files ? Object.keys(req.files).length : 0 }
      ],
      `Начало создания информационного блока`
    );
    
    const item = await infoService.create(data, req.files);
    
    // Логирование успешного создания
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'CREATE_INFO_SUCCESS',
      {
        id: item._id.toString(),
        email: 'system@info'
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
      `Создан информационный блок "${item.title}". ID: ${item._id}, slug: ${item.slug}`
    );
    
    res.status(201).json(item);
  } catch (err) {
    // Логирование ошибки создания
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'CREATE_INFO_FAILED',
      null,
      [
        { field: 'error', old: null, new: err.message },
        { field: 'requestData', old: null, new: JSON.stringify(req.body).slice(0, 500) }
      ],
      `Ошибка при создании информационного блока: ${err.message}`
    );
    
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // Получаем текущие данные для логирования изменений
    let itemBefore = null;
    try {
      itemBefore = await infoService.getItemById(id);
    } catch (err) {
      console.warn(`Не удалось получить данные элемента ${id} для аудита:`, err.message);
    }

    if (typeof data.contentBlocks === "string") {
      try {
        data.contentBlocks = JSON.parse(data.contentBlocks);
      } catch {
        // Логирование ошибки формата данных
        await auditLogger.logAdminEvent(
          req.user.id,
          req.user.email,
          req.user.role,
          'INFO_CONTENT_MANAGEMENT',
          'UPDATE_INFO_INVALID_FORMAT',
          {
            id: id,
            email: 'system@info'
          },
          [],
          `Неверный формат contentBlocks при обновлении элемента ${id}`
        );
        return next(ApiError.BadRequest("Неверный формат contentBlocks"));
      }
    }

    if (req.files?.cover && req.files.cover.length > 0) {
      const coverFile = req.files.cover[0];
      data.imageUrl = `/uploads/info/${data.slug}/${coverFile.filename}`;
    }

    if (req.files?.contentImages) {
      const uploadedImages = req.files.contentImages.map(
        f => `/uploads/info/${data.slug}/${f.filename}`
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

    // Логирование начала обновления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'UPDATE_INFO_START',
      {
        id: id,
        email: 'system@info'
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
      `Начало обновления информационного блока ${id}`
    );

    const updated = await infoService.update(id, data);
    
    // Определяем изменения для детального логирования
    const changes = [];
    
    if (itemBefore) {
      // Сравниваем заголовок
      if (itemBefore.title !== updated.title) {
        changes.push({
          field: 'title',
          old: itemBefore.title,
          new: updated.title
        });
      }
      
      // Сравниваем slug
      if (itemBefore.slug !== updated.slug) {
        changes.push({
          field: 'slug',
          old: itemBefore.slug,
          new: updated.slug
        });
      }
      
      // Проверяем обложку
      if (itemBefore.imageUrl !== updated.imageUrl) {
        changes.push({
          field: 'coverImage',
          old: itemBefore.imageUrl ? 'есть' : 'нет',
          new: updated.imageUrl ? 'обновлена' : 'удалена'
        });
      }
      
      // Сравниваем количество блоков контента
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
    
    // Логирование успешного обновления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'UPDATE_INFO_SUCCESS',
      {
        id: id,
        email: 'system@info'
      },
      changes.length > 0 ? changes : [
        { 
          field: 'updatedAt', 
          old: itemBefore?.updatedAt, 
          new: updated.updatedAt 
        }
      ],
      `Обновлен информационный блок "${updated.title}" (ID: ${id}). Изменений: ${changes.length}`
    );
    
    res.status(200).json(updated);
  } catch (err) {
    // Логирование ошибки обновления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'UPDATE_INFO_FAILED',
      {
        id: req.params.id,
        email: 'system@info'
      },
      [
        { field: 'error', old: null, new: err.message },
        { field: 'params', old: null, new: JSON.stringify(req.params) }
      ],
      `Ошибка при обновлении информационного блока ${req.params.id}: ${err.message}`
    );
    
    next(err);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Получаем текущие данные для логирования
    let itemBefore = null;
    try {
      itemBefore = await infoService.getItemById(id);
    } catch (err) {
      console.warn(`Не удалось получить данные элемента ${id} для аудита:`, err.message);
    }

    // Логирование начала удаления
    await auditLogger.l(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'DELETE_INFO_START',
      {
        id: id,
        email: 'system@info'
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
      `Начало удаления информационного блока ${id}`
    );

    await infoService.deleteItem(id);
    
    // Логирование успешного удаления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'DELETE_INFO_SUCCESS',
      {
        id: id,
        email: 'system@info'
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
      `Удален информационный блок "${itemBefore?.title || 'неизвестно'}" (ID: ${id})`
    );
    
    res.status(204).send();
  } catch (err) {
    // Логирование ошибки удаления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'INFO_CONTENT_MANAGEMENT',
      'DELETE_INFO_FAILED',
      {
        id: req.params.id,
        email: 'system@info'
      },
      [
        { field: 'error', old: null, new: err.message },
        { field: 'params', old: null, new: JSON.stringify(req.params) }
      ],
      `Ошибка при удалении информационного блока ${req.params.id}: ${err.message}`
    );
    
    next(err);
  }
};

module.exports = {
  getAll,
  getBySlug,
  create,
  update,
  delete: deleteItem,
};