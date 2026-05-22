// controllers/topicController.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import auditLogger from "../logger/auditLogger.js";
import logger from "../logger/logger.js";
import TopicService from "../services/topicService.js";
import type {
  CreateTopicReq,
  DeleteTopicReq,
  GetAllTopicsReq,
  GetTopicBySlugReq,
  UpdateTopicReq,
} from "../types/controllers/topic-controller.js";
import type {
  IContentBlock,
  ITopicCommon,
} from "../types/topicCommon.types.js";

class TopicController {
  private readonly topicService = new TopicService(); // Создаём экземпляр, а не используем класс

  getAll = async (
    _req: GetAllTopicsReq, // Префикс _ для неиспользуемого параметра
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const items = await this.topicService.getAll();
      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  };

  getBySlug = async (
    req: GetTopicBySlugReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        return next(
          ApiError.BadRequest("Недостаточно данных для получения записи."),
        );
      }
      const item = await this.topicService.getBySlugWithRelated(slug);
      if (!item) {
        return next(ApiError.BadRequest("Запись не найдена."));
      }
      res.status(200).json(item);
    } catch (err) {
      next(err);
    }
  };

  create = async (
    req: CreateTopicReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = req.body;
      const files = req.files;
      const userId = req.user.id;
      const userEmail = req.user.email;
      const userRole = req.user.role;

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "CREATE_TOPIC_START",
        null,
        [
          { field: "title", old: null, new: data.title || "без названия" },
          { field: "slug", old: null, new: data.slug || "без slug" },
          {
            field: "filesCount",
            old: null,
            new: files ? Object.keys(files).length : 0,
          },
        ],
        `Начало создания темы`,
      );

      const item = await this.topicService.create(data, files);

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "CREATE_TOPIC_SUCCESS",
        {
          id: item._id.toString(),
          email: "system@topic",
        },
        [
          {
            field: "contentBlocksCount",
            old: null,
            new: item.contentBlocks?.length || 0,
          },
          {
            field: "createdAt",
            old: null,
            new: item.createdAt,
          },
          {
            field: "hasCover",
            old: null,
            new: !!item.imageUrl,
          },
        ],
        `Создана тема "${item.title}". ID: ${item._id}, slug: ${item.slug}`,
      );

      res.status(201).json(item);
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user?.id || "unknown",
        req.user?.email || "unknown",
        req.user?.role || "unknown",
        "TOPIC_CONTENT_MANAGEMENT",
        "CREATE_TOPIC_FAILED",
        null,
        [
          { field: "error", old: null, new: error.message },
          {
            field: "requestData",
            old: null,
            new: JSON.stringify(req.body).slice(0, 500),
          },
        ],
        `Ошибка при создании темы: ${error.message}`,
      );
      next(err);
    }
  };

  update = async (
    req: UpdateTopicReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const data = req.body;
      const files = req.files;
      const userId = req.user.id;
      const userEmail = req.user.email;
      const userRole = req.user.role;

      let itemBefore = null;
      try {
        itemBefore = await this.topicService.getItemById(id);
      } catch (err) {
        console.warn(
          `Не удалось получить данные элемента ${id} для аудита:`,
          (err as Error).message,
        );
      }

      // Парсинг contentBlocks если пришла строка
      if (typeof data.contentBlocks === "string") {
        try {
          data.contentBlocks = JSON.parse(data.contentBlocks);
        } catch {
          await auditLogger.logAdminEvent(
            userId,
            userEmail,
            userRole,
            "TOPIC_CONTENT_MANAGEMENT",
            "UPDATE_TOPIC_INVALID_FORMAT",
            {
              id: id,
              email: "system@topic",
            },
            [],
            `Неверный формат contentBlocks при обновлении элемента ${id}`,
          );
          return next(ApiError.BadRequest("Неверный формат contentBlocks"));
        }
      }

      // Обработка загруженной обложки
      if (files?.cover && files.cover.length > 0) {
        const coverFile = files.cover[0];
        const slug = data.slug || itemBefore?.slug;
        if (slug) {
          data.imageUrl = `/uploads/topics/${slug}/${coverFile.filename}`;
        }
      }

      // Обработка изображений внутри контента
      if (
        files?.contentImages &&
        data.contentBlocks &&
        Array.isArray(data.contentBlocks)
      ) {
        const uploadedImages = files.contentImages.map(
          (f) =>
            `/uploads/topics/${data.slug || itemBefore?.slug}/${f.filename}`,
        );
        let imgIndex = 0;
        // Заменяем any на конкретный тип IContentBlock
        data.contentBlocks = data.contentBlocks.map((block: IContentBlock) => {
          if (block.type === "image" && block.value === "upload_placeholder") {
            return {
              ...block,
              value: uploadedImages[imgIndex++] || block.value,
            };
          }
          return block;
        });
      }

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "UPDATE_TOPIC_START",
        {
          id: id,
          email: "system@topic",
        },
        [
          {
            field: "oldTitle",
            old: null,
            new: itemBefore?.title || "неизвестно",
          },
          {
            field: "newTitle",
            old: null,
            new: data.title || itemBefore?.title || "без названия",
          },
          {
            field: "filesCount",
            old: null,
            new: files ? Object.keys(files).length : 0,
          },
        ],
        `Начало обновления темы ${id}`,
      );

      const updatePayload: Partial<ITopicCommon> = {
        title: data.title,
        slug: data.slug,
        description: data.description,
        position: data.position,
        imageUrl: data.imageUrl,
      };

      if (data.contentBlocks && Array.isArray(data.contentBlocks)) {
        updatePayload.contentBlocks = data.contentBlocks as IContentBlock[];
      } else if (data.contentBlocks) {
        logger.warn(`[update] contentBlocks остался строкой для id ${id}`);
      }

      const updated = await this.topicService.update(id, updatePayload);

      const changes: Array<{ field: string; old: unknown; new: unknown }> = [];
      if (itemBefore) {
        if (itemBefore.title !== updated.title) {
          changes.push({
            field: "title",
            old: itemBefore.title,
            new: updated.title,
          });
        }
        if (itemBefore.slug !== updated.slug) {
          changes.push({
            field: "slug",
            old: itemBefore.slug,
            new: updated.slug,
          });
        }
        if (itemBefore.imageUrl !== updated.imageUrl) {
          changes.push({
            field: "coverImage",
            old: itemBefore.imageUrl ? "есть" : "нет",
            new: updated.imageUrl ? "обновлена" : "удалена",
          });
        }
        const oldBlocksCount = itemBefore.contentBlocks?.length || 0;
        const newBlocksCount = updated.contentBlocks?.length || 0;
        if (oldBlocksCount !== newBlocksCount) {
          changes.push({
            field: "contentBlocksCount",
            old: oldBlocksCount,
            new: newBlocksCount,
          });
        }
      }

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "UPDATE_TOPIC_SUCCESS",
        {
          id: id,
          email: "system@topic",
        },
        changes.length > 0
          ? changes
          : [
              {
                field: "updatedAt",
                old: itemBefore?.updatedAt,
                new: updated.updatedAt,
              },
            ],
        `Обновлена тема "${updated.title}" (ID: ${id}). Изменений: ${changes.length}`,
      );

      res.status(200).json(updated);
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "TOPIC_CONTENT_MANAGEMENT",
        "UPDATE_TOPIC_FAILED",
        {
          id: req.params.id,
          email: "system@topic",
        },
        [
          { field: "error", old: null, new: error.message },
          { field: "params", old: null, new: JSON.stringify(req.params) },
        ],
        `Ошибка при обновлении темы ${req.params.id}: ${error.message}`,
      );
      next(err);
    }
  };

  delete = async (
    req: DeleteTopicReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userEmail = req.user.email;
      const userRole = req.user.role;

      let itemBefore = null;
      try {
        itemBefore = await this.topicService.getItemById(id);
      } catch (err) {
        console.warn(
          `Не удалось получить данные элемента ${id} для аудита:`,
          (err as Error).message,
        );
      }

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "DELETE_TOPIC_START",
        {
          id: id,
          email: "system@topic",
        },
        [
          {
            field: "itemTitle",
            old: null,
            new: itemBefore?.title || "неизвестно",
          },
          {
            field: "itemSlug",
            old: null,
            new: itemBefore?.slug || "неизвестно",
          },
          {
            field: "contentBlocksCount",
            old: null,
            new: itemBefore?.contentBlocks?.length || 0,
          },
        ],
        `Начало удаления темы ${id}`,
      );

      await this.topicService.deleteItem(id);

      await auditLogger.logAdminEvent(
        userId,
        userEmail,
        userRole,
        "TOPIC_CONTENT_MANAGEMENT",
        "DELETE_TOPIC_SUCCESS",
        {
          id: id,
          email: "system@topic",
        },
        [
          {
            field: "status",
            old: "активен",
            new: "удален",
          },
          {
            field: "deletedBy",
            old: null,
            new: userId,
          },
          {
            field: "deletedAt",
            old: null,
            new: new Date().toISOString(),
          },
        ],
        `Удалена тема "${itemBefore?.title || "неизвестно"}" (ID: ${id})`,
      );

      res.status(204).send();
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "TOPIC_CONTENT_MANAGEMENT",
        "DELETE_TOPIC_FAILED",
        {
          id: req.params.id,
          email: "system@topic",
        },
        [
          { field: "error", old: null, new: error.message },
          { field: "params", old: null, new: JSON.stringify(req.params) },
        ],
        `Ошибка при удалении темы ${req.params.id}: ${error.message}`,
      );
      next(err);
    }
  };
}

export default new TopicController();
