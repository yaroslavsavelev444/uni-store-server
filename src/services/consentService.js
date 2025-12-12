
const ApiError = require("../exceptions/api-error");
const { ConsentModel } = require("../models/index.models");
const { incrementVersion } = require("../utils/versioning");

// Создание нового соглашения
const createConsent = async (title, slug, content, isRequired = true) => {
  try {
    const newConsent = new ConsentModel({
      title,
      slug,
      isRequired,
      versions: [
        {
          version: "1.0.0",
          content,
          status: "draft",
        },
      ],
    });

    return newConsent.save();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Добавление новой версии соглашения
const addVersion = async (slug, content, authorId, changeDescription) => {
  try {
    const consent = await ConsentModel.findOne({ slug });
    if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

    // Получаем последнюю версию
    const lastVersion = consent.versions.slice(-1)[0];

    // Генерируем новую версию
    const newVersion = {
      version: incrementVersion(lastVersion.version, "minor"),
      content,
      status: "draft",
      changes: [
        {
          author: authorId,
          description: changeDescription || "Новая версия",
        },
      ],
    };

    consent.versions.push(newVersion);
    return consent.save();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Публикация версии соглашения
const publishVersion = async (slug, versionId) => {
  try {
    const consent = await ConsentModel.findOne({ slug });
    if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

    const version = consent.versions.id(versionId);
    if (!version) throw ApiError.BadRequest("Версия не найдена");

    if (version.status === "published") {
      throw ApiError.BadRequest("Версия уже опубликована");
    }
    
    // Деактивируем текущую опубликованную версию
    consent.versions.forEach((v) => {
      if (v.status === "published") {
        v.status = 'archived';
      }
    });

    // Активируем новую версию
    version.status = "published";
    version.publishedAt = new Date();
    consent.currentPublished = version._id;

    return consent.save();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Редактирование черновика версии
const updateDraftVersion = async (
  slug,
  versionId,
  content,
  authorId,
  changeDescription
) => {
  try {
    const consent = await ConsentModel.findOne({ slug });
    if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

    const version = consent.versions.id(versionId);
    if (!version) throw ApiError.BadRequest("Версия не найдена");

    if (version.status !== "draft") {
      throw ApiError.BadRequest("Можно редактировать только черновики");
    }

    version.content = content;
    version.changes.push({
      author: authorId,
      description: changeDescription || "Редактирование черновика",
    });

    return consent.save();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Удаление версии (только черновик)
const deleteVersion = async (slug, versionId) => {
  try {
    const consent = await ConsentModel.findOne({ slug });
    if (!consent) throw ApiError.BadRequest("Соглашение не найдено");

    const version = consent.versions.id(versionId);
    if (!version) throw ApiError.BadRequest("Версия не найдена");

    if (version.status !== "draft") {
      throw ApiError.BadRequest("Можно удалять только черновики");
    }

    consent.versions.pull(versionId);
    return consent.save();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Получение активной версии
const getActiveVersion = async (slug) => {
  try {
    const consent = await ConsentModel.findOne({ slug })
      .select("title slug currentPublished versions")
      .populate("currentPublished");

    if (!consent || !consent.currentPublished) {
      throw ApiError.BadRequest("Активная версия не найдено");
    }

    return {
      title: consent.title,
      slug: consent.slug,
      version: consent.currentPublished.version,
      content: consent.currentPublished.content,
      publishedAt: consent.currentPublished.publishedAt,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

// Получение всех соглашений
const listConsents = async () => {
  try {
    return ConsentModel.find()
      .select("title slug isRequired currentPublished versions")
      .populate("currentPublished", "version publishedAt");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
};

//Получение конкретной по slug 
const getConsentBySlug = async (slug) => {
  try {
    return ConsentModel.findOne({ slug }).populate("currentPublished");
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw ApiError.InternalServerError(error.message);
    }
  }
}

const checkAllAcceptedConsents = async (acceptedSlugs) => {
    const consents = await ConsentModel.find({ slug: { $in: acceptedSlugs } })
      .select("title slug currentPublished isRequired")
      .populate("currentPublished");

    // 2. Проверка обязательных согласий
    const requiredConsents = await ConsentModel.find({ isRequired: true }).select("slug");

    const missingRequired = requiredConsents
      .map(c => c.slug)
      .filter(slug => !acceptedSlugs.includes(slug));

    if (missingRequired.length > 0) {
      throw ApiError.BadRequest(`Отсутствуют обязательные согласия: ${missingRequired.join(', ')}`);
    }

    // 3. Приводим к нужному формату
    const formattedConsents = consents.map(consent => {
      if (!consent.currentPublished) {
        throw ApiError.BadRequest(`У согласия "${consent.slug}" нет опубликованной версии`);
      }

      return {
        title: consent.title,
        slug: consent.slug,
        version: consent.currentPublished.version,
        content: consent.currentPublished.content,
        publishedAt: consent.currentPublished.publishedAt
      };
    });

    return formattedConsents
}

module.exports = {
  createConsent,
  addVersion,
  publishVersion,
  updateDraftVersion,
  deleteVersion,
  getActiveVersion,
  listConsents,
  getConsentBySlug,
  checkAllAcceptedConsents
};
