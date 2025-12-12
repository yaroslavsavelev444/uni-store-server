const ApiError = require("../exceptions/api-error");
const consentService = require("../services/consentService");
const auditLogger = require("../logger/auditLogger"); 

const create = async (req, res, next) => {
  try {
    console.log('🔄 Начинаю создание соглашения...');
    console.log('Пользователь:', req.user);
    
    const { title, slug, content, isRequired } = req.body;
    
    if(!title || !slug || !content) {
      console.log('❌ Недостаточно данных для создания соглашения');
      return next(ApiError.BadRequest("Недостаточно данных для создания соглашения."));
    }
    
    console.log(`Создание соглашения: ${title}, slug: ${slug}`);
    
    const consent = await consentService.createConsent(
      title,
      slug,
      content,
      isRequired
    );
    
    console.log(`✅ Соглашение создано, ID: ${consent._id}`);
    
    // Логирование создания соглашения
    console.log('📝 Начинаю логирование создания соглашения...');
    
    try {
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role || 'admin',
        'CONSENT_MANAGEMENT',
        'CREATE_CONSENT',
        null,
        [
          { field: 'title', old: null, new: title },
          { field: 'slug', old: null, new: slug },
          { field: 'isRequired', old: null, new: isRequired || false },
          { field: 'consentId', old: null, new: consent._id.toString() }
        ],
        `Создано новое соглашение: "${title}" (ID: ${consent._id})`
      );
      console.log('✅ Логирование успешно завершено');
    } catch (logError) {
      console.error('❌ Ошибка при логировании:', logError);
      // Продолжаем выполнение даже если логирование не удалось
    }
    
    res.status(201).json(consent);
  } catch (error) {
    console.error('❌ Ошибка при создании соглашения:', error);
    
    // Логирование ошибки создания
    try {
      await auditLogger.logAdminEvent(
        req.user?.id || 'unknown',
        req.user?.email || 'unknown@system',
        req.user?.role || 'unknown',
        'CONSENT_MANAGEMENT',
        'CREATE_CONSENT_FAILED',
        null,
        [
          { field: 'error', old: null, new: error.message },
          { field: 'title', old: null, new: req.body?.title || 'неизвестно' }
        ],
        `Ошибка при создании соглашения: ${error.message}`
      );
    } catch (logError) {
      console.error('❌ Ошибка при логировании ошибки:', logError);
    }
    
    next(error);
  }
};


// Добавление новой версии
const addVersion = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { content, changeDescription } = req.body;

    if(!content || !changeDescription || !slug) {
        return next (ApiError.BadRequest("Недостаточно данных для создания версии."));
    }

    // Получаем текущее соглашение для логирования
    const currentConsent = await consentService.getConsentBySlug(slug);
    
    const consent = await consentService.addVersion(
      slug,
      content,
      req.user.id,
      changeDescription
    );
    
    // Логирование добавления версии
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'ADD_VERSION',
      {
        id: currentConsent._id.toString(),
        email: 'system@consent'
      },
      [
        { 
          field: 'versions', 
          old: `${currentConsent.versions?.length || 0} версий`, 
          new: `${consent.versions?.length || 0} версий` 
        },
        { 
          field: 'lastVersionId', 
          old: currentConsent.latestVersion?._id?.toString() || 'нет', 
          new: consent.latestVersion?._id?.toString() 
        }
      ],
      `Добавлена новая версия соглашения "${slug}". Описание изменений: ${changeDescription}`
    );
    
    res.json(consent);
  } catch (error) {
    // Логирование ошибки добавления версии
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'ADD_VERSION_FAILED',
      null,
      [],
      `Ошибка при добавлении версии соглашения "${req.params.slug}": ${error.message}`
    );
    next(error);
  }
};

// Публикация версии
const publishVersion = async (req, res, next) => {
  try {
    const { slug, versionId } = req.params;
    if(!slug || !versionId) {
      return next (ApiError.BadRequest("Недостаточно данных для публикации версии."));
    }
    
    // Получаем текущее состояние для логирования
    const currentConsent = await consentService.getConsentBySlug(slug);
    const currentActiveVersion = currentConsent.versions?.find(v => v.isActive);
    
    const consent = await consentService.publishVersion(slug, versionId);
    const publishedVersion = consent.versions.find(v => v._id.toString() === versionId);
    
    // Логирование публикации версии
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'PUBLISH_VERSION',
      {
        id: currentConsent._id.toString(),
        email: 'system@consent'
      },
      [
        { 
          field: 'activeVersion', 
          old: currentActiveVersion?._id?.toString() || 'нет', 
          new: versionId 
        },
        { 
          field: 'versionStatus', 
          old: publishedVersion?.isDraft ? 'черновик' : 'неизвестно', 
          new: 'активная' 
        }
      ],
      `Опубликована версия ${versionId} соглашения "${slug}". Новая активная версия.`
    );
    
    res.json(consent);
  } catch (error) {
    // Логирование ошибки публикации
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'PUBLISH_VERSION_FAILED',
      null,
      [],
      `Ошибка при публикации версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
    );
    next(error);
  }
};

// Редактирование черновика
const updateVersion = async (req, res , next) => {
  try {
    const { slug, versionId } = req.params;
    const { content, changeDescription } = req.body;
    if(!content || !changeDescription || !slug || !versionId) {
      return next (ApiError.BadRequest("Недостаточно данных для обновления версии."));
    }
    
    // Получаем текущую версию для логирования
    const currentConsent = await consentService.getConsentBySlug(slug);
    const currentVersion = currentConsent.versions.find(v => v._id.toString() === versionId);
    
    const consent = await consentService.updateDraftVersion(
      slug,
      versionId,
      content,
      req.user.id,
      changeDescription
    );
    
    // Логирование обновления версии
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'UPDATE_VERSION',
      {
        id: currentConsent._id.toString(),
        email: 'system@consent'
      },
      [
        { 
          field: 'contentUpdated', 
          old: 'предыдущая версия', 
          new: 'обновленная версия' 
        },
        { 
          field: 'updatedBy', 
          old: currentVersion?.updatedBy?._id?.toString() || 'неизвестно', 
          new: req.user.id 
        }
      ],
      `Обновлен черновик версии ${versionId} соглашения "${slug}". Описание изменений: ${changeDescription}`
    );
    
    res.json(consent);
  } catch (error) {
    // Логирование ошибки обновления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'UPDATE_VERSION_FAILED',
      null,
      [],
      `Ошибка при обновлении версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
    );
    next(error);
  }
};

// Удаление версии
const deleteVersion = async (req, res, next) => {
  try {
    const { slug, versionId } = req.params;
    if(!slug || !versionId) {
      return next (ApiError.BadRequest("Недостаточно данных для удаления версии."));
    }
    
    // Получаем текущее состояние для логирования
    const currentConsent = await consentService.getConsentBySlug(slug);
    const versionToDelete = currentConsent.versions.find(v => v._id.toString() === versionId);
    
    const consent = await consentService.deleteVersion(slug, versionId);
    
    // Логирование удаления версии
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'DELETE_VERSION',
      {
        id: currentConsent._id.toString(),
        email: 'system@consent'
      },
      [
        { 
          field: 'deletedVersion', 
          old: versionId, 
          new: 'удалена' 
        },
        { 
          field: 'versionStatus', 
          old: versionToDelete?.isActive ? 'активная' : versionToDelete?.isDraft ? 'черновик' : 'архив', 
          new: 'удалена' 
        }
      ],
      `Удалена версия ${versionId} соглашения "${slug}". Тип версии: ${versionToDelete?.isActive ? 'активная' : versionToDelete?.isDraft ? 'черновик' : 'архив'}.`
    );
    
    res.json(consent);
  } catch (error) {
    // Логирование ошибки удаления
    await auditLogger.logAdminEvent(
      req.user.id,
      req.user.email,
      req.user.role,
      'CONSENT_VERSION_MANAGEMENT',
      'DELETE_VERSION_FAILED',
      null,
      [],
      `Ошибка при удалении версии ${req.params.versionId} соглашения "${req.params.slug}": ${error.message}`
    );
    next(error);
  }
};

// Получение активной версии
const getActive = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if(!slug) {
      return next (ApiError.BadRequest("Недостаточно данных для получения активной версии."));
    }
    const version = await consentService.getActiveVersion(slug);
    res.json(version);
  } catch (error) {
    next(error);    
  }
};

// Список всех соглашений
const list = async (req, res, next) => {
  try {
    // Логирование просмотра списка соглашений (если это админская операция)
    // if (req.user.role !== 'user') {
    //   await auditLogger.logAdminEvent(
    //     req.user.id,
    //     req.user.email,
    //     req.user.role,
    //     'CONSENT_MANAGEMENT',
    //     'VIEW_LIST',
    //     null,
    //     [],
    //     `Просмотр списка всех соглашений`
    //   );
    // }
    
    const consents = await consentService.listConsents();
    console.log('consents',consents );
    
    res.json(consents);
  } catch (error) {
    next(error);
  }
};

const getBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug) {
      return next(ApiError.BadRequest("Недостаточно данных для получения соглашения."));
    }
    
    // Логирование просмотра соглашения (если это админская операция)
    // if (req.user.role !== 'user') {
    //   await auditLogger.logAdminEvent(
    //     req.user.id,
    //     req.user.email,
    //     req.user.role,
    //     'CONSENT_MANAGEMENT',
    //     'VIEW_DETAILS',
    //     null,
    //     [
    //       { field: 'slug', old: null, new: slug }
    //     ],
    //     `Просмотр деталей соглашения "${slug}"`
    //   );
    // }
    
    const consent = await consentService.getConsentBySlug(slug);
    res.json(consent);
  } catch (error) {
    next(error);
  }
};


module.exports = {
  create,
  addVersion,
  publishVersion,
  updateVersion,
  deleteVersion,
  getActive,
  list,
  getBySlug,
};