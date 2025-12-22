const path = require("path");
const xss = require("xss");
const ApiError = require("../exceptions/api-error");
const calculateReadingTime = require("../utils/calculateReadingTime");
const { TopicModelCommon } = require("../models/index.models");

const getAll = async () => {
  return await TopicModelCommon.find({})
  .sort({ position: 1, createdAt: -1 })
  .lean();
};

const getBySlugWithRelated = async (slug) => {
  const item = await TopicModelCommon.findOne({ slug }).lean();
  if (!item) return null;

  // Ищем связанные записи по позиции/другим полям, исключая текущий
  const relatedTopics = await TopicModelCommon.find({
    _id: { $ne: item._id },
  })
    .select("_id slug title")
    .limit(2)
    .lean();

  return {
    ...item,
    relatedTopics,
  };
};

const create = async (data, files) => {
  const cleanTitle = xss(data.title);
  const cleanSlug = xss(data.slug);
  const cleanDescription = xss(data.description || "");
  const position = data.position || 0;

  const baseUrl = `/uploads/topics/${cleanSlug}/`;
  const coverFile = files?.cover?.[0];
  const contentImages = files?.contentImages || [];

  const imageUrl = coverFile ? path.join(baseUrl, coverFile.filename).replace(/\\/g, "/") : "";

  let parsedContentBlocks = data.contentBlocks || [];
  if (typeof parsedContentBlocks === "string") {
    try {
      parsedContentBlocks = JSON.parse(parsedContentBlocks);
    } catch {
      throw ApiError.BadRequest("Неверный формат contentBlocks");
    }
  }

  const fileMap = {};
  contentImages.forEach((file) => {
    const originalBaseName = path.basename(file.originalname);
    fileMap[originalBaseName] = path.join(baseUrl, file.filename).replace(/\\/g, "/");
  });

  const cleanAndReplaceBlock = (block) => {
    const cleanedBlock = { ...block };
    cleanedBlock.type = xss(cleanedBlock.type);

    if (cleanedBlock.type === "text" || cleanedBlock.type === "heading" || cleanedBlock.type === "highlighted") {
      cleanedBlock.value = xss(cleanedBlock.value);
    } else if (cleanedBlock.type === "image") {
      const originalName = cleanedBlock.value;
      cleanedBlock.value = fileMap[originalName] || cleanedBlock.value;
    } else if (cleanedBlock.type === "link") {
      cleanedBlock.value = {
        url: xss(cleanedBlock.value?.url || ""),
        text: xss(cleanedBlock.value?.text || ""),
      };
    } else if (cleanedBlock.type === "list") {
      if (Array.isArray(cleanedBlock.value)) {
        cleanedBlock.value = cleanedBlock.value.map((item) => xss(item));
      } else {
        cleanedBlock.value = [];
      }
    }

    return cleanedBlock;
  };

  const finalContentBlocks = parsedContentBlocks.map(cleanAndReplaceBlock);
  const readingTime = calculateReadingTime(finalContentBlocks);

  // Проверка уникальности slug
  const existing = await TopicModelCommon.findOne({ slug: cleanSlug });
  if (existing) {
    throw ApiError.BadRequest("Запись с таким slug уже существует");
  }

  const newItem = await TopicModelCommon.create({
    title: cleanTitle,
    slug: cleanSlug,
    description: cleanDescription,
    position,
    imageUrl,
    contentBlocks: finalContentBlocks,
    readingTime,
  });

  return newItem;

};

const update = async (id, data) => {
  if (data.contentBlocks) {
    data.readingTime = calculateReadingTime(data.contentBlocks);
  }
  return await TopicModelCommon.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const deleteItem = async (id) => {
  return await TopicModelCommon.findByIdAndDelete(id);
};

module.exports = {
  getAll,
  getBySlugWithRelated,
  create,
  update,
  deleteItem,
};