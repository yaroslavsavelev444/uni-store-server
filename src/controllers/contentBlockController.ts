// controllers/content-block.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import auditLogger from "../logger/auditLogger.js";
import ContentBlockService from "../services/contentBlockService.js";
import type { IContentBlockDocument } from "../types/contentBlock.types.js";
import type {
  ApiResponse,
  CreateReq,
  DeleteReq,
  GetAllReq,
  GetByIdReq,
  GetByTagReq,
  GetStatsReq,
  ToggleActiveReq,
  UpdateReq,
} from "../types/controllers/content-block-controller.js";

/**
 * Контроллер для управления контент-блоками.
 * Все методы требуют авторизации (только для администраторов).
 */
class ContentBlockController {
  private readonly contentBlockService = ContentBlockService;

  /**
   * Получение всех контент-блоков.
   * GET /api/content-blocks?includeInactive=true
   */
  getAll = async (
    req: GetAllReq,
    res: Response<ApiResponse<IContentBlockDocument[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { includeInactive } = req.query;
      const items = await this.contentBlockService.getAll(
        includeInactive === "true",
      );
      res.status(200).json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение блока по ID.
   * GET /api/content-blocks/:id
   */
  getById = async (
    req: GetByIdReq,
    res: Response<ApiResponse<IContentBlockDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw ApiError.BadRequest("ID блока обязателен");
      }
      const item = await this.contentBlockService.getById(id);
      if (!item) {
        throw ApiError.BadRequest("Блок не найден");
      }
      res.status(200).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение блоков по тегу.
   * GET /api/content-blocks/tag/:tag
   */
  getByTag = async (
    req: GetByTagReq,
    res: Response<ApiResponse<IContentBlockDocument[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tag } = req.params;
      if (!tag || !tag.trim()) {
        throw ApiError.BadRequest("Тег обязателен");
      }
      const items = await this.contentBlockService.getByTag(tag);
      res.status(200).json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Создание нового контент-блока.
   * POST /api/content-blocks
   */
  create = async (
    req: CreateReq,
    res: Response<ApiResponse<IContentBlockDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = req.body;
      const tempImagePath = data.imageUrl || null;
      const userId = req.user.id;

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "CREATE_BLOCK_START",
        null,
        [
          { field: "title", old: null, new: data.title || "без названия" },
          { field: "hasImage", old: null, new: !!tempImagePath },
        ],
        "Начало создания контент-блока",
      );

      const item = await this.contentBlockService.create(data, userId);

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "CREATE_BLOCK_SUCCESS",
        { id: item._id.toString(), email: "system@contentblock" },
        [
          { field: "id", old: null, new: item._id.toString() },
          { field: "hasButton", old: null, new: !!item.button?.text },
          { field: "isActive", old: null, new: item.isActive },
          { field: "position", old: null, new: item.position },
        ],
        `Создан контент-блок "${item.title}". ID: ${item._id}`,
      );

      res.status(201).json({ success: true, data: item });
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "CREATE_BLOCK_FAILED",
        null,
        [
          { field: "error", old: null, new: error.message },
          { field: "title", old: null, new: req.body.title || "без названия" },
        ],
        `Ошибка при создании контент-блока: ${error.message}`,
      );
      next(err);
    }
  };

  /**
   * Обновление контент-блока.
   * PUT /api/content-blocks/:id
   */
  update = async (
    req: UpdateReq,
    res: Response<ApiResponse<IContentBlockDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const data = req.body;
      const tempImagePath = data.tempImagePath || null;
      const userId = req.user.id;

      let itemBefore: IContentBlockDocument | null = null;
      try {
        itemBefore = await this.contentBlockService.getById(id);
      } catch (err) {
        console.warn(
          `Не удалось получить данные блока ${id} для аудита:`,
          (err as Error).message,
        );
      }

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "UPDATE_BLOCK_START",
        { id, email: "system@contentblock" },
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
          { field: "hasNewImage", old: null, new: !!tempImagePath },
        ],
        `Начало обновления контент-блока ${id}`,
      );

      const updated = await this.contentBlockService.update(id, data, userId);

      const changes: Array<{ field: string; old: unknown; new: unknown }> = [];
      if (itemBefore) {
        if (itemBefore.title !== updated.title) {
          changes.push({
            field: "title",
            old: itemBefore.title,
            new: updated.title,
          });
        }
        if (itemBefore.subtitle !== updated.subtitle) {
          changes.push({
            field: "subtitle",
            old: itemBefore.subtitle,
            new: updated.subtitle,
          });
        }
        if (itemBefore.isActive !== updated.isActive) {
          changes.push({
            field: "isActive",
            old: itemBefore.isActive,
            new: updated.isActive,
          });
        }
        if (itemBefore.position !== updated.position) {
          changes.push({
            field: "position",
            old: itemBefore.position,
            new: updated.position,
          });
        }
        if (itemBefore.imageUrl !== updated.imageUrl) {
          changes.push({
            field: "image",
            old: itemBefore.imageUrl ? "есть" : "нет",
            new: updated.imageUrl ? "обновлено" : "удалено",
          });
        }
      }

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "UPDATE_BLOCK_SUCCESS",
        { id, email: "system@contentblock" },
        changes.length > 0
          ? changes
          : [
              {
                field: "updatedAt",
                old: itemBefore?.updatedAt,
                new: updated.updatedAt,
              },
            ],
        `Обновлен контент-блок "${updated.title}" (ID: ${id}). Изменений: ${changes.length}`,
      );

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "UPDATE_BLOCK_FAILED",
        { id: req.params.id, email: "system@contentblock" },
        [
          { field: "error", old: null, new: error.message },
          { field: "params", old: null, new: JSON.stringify(req.params) },
        ],
        `Ошибка при обновлении контент-блока ${req.params.id}: ${error.message}`,
      );
      next(err);
    }
  };

  /**
   * Удаление контент-блока.
   * DELETE /api/content-blocks/:id
   */
  delete = async (
    req: DeleteReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      let itemBefore: IContentBlockDocument | null = null;
      try {
        itemBefore = await this.contentBlockService.getById(id);
      } catch (err) {
        console.warn(
          `Не удалось получить данные блока ${id} для аудита:`,
          (err as Error).message,
        );
      }

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "DELETE_BLOCK_START",
        { id, email: "system@contentblock" },
        [
          { field: "title", old: null, new: itemBefore?.title || "неизвестно" },
          { field: "hasImage", old: null, new: !!itemBefore?.imageUrl },
          { field: "hasButton", old: null, new: !!itemBefore?.button?.text },
        ],
        `Начало удаления контент-блока ${id}`,
      );

      await this.contentBlockService.delete(id);

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "DELETE_BLOCK_SUCCESS",
        { id, email: "system@contentblock" },
        [
          { field: "status", old: "активен", new: "удален" },
          { field: "deletedBy", old: null, new: userId },
          { field: "deletedAt", old: null, new: new Date().toISOString() },
        ],
        `Удален контент-блок "${itemBefore?.title || "неизвестно"}" (ID: ${id})`,
      );

      res.status(204).send();
    } catch (err) {
      const error = err as Error;
      await auditLogger.logAdminEvent(
        req.user.id,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        "DELETE_BLOCK_FAILED",
        { id: req.params.id, email: "system@contentblock" },
        [
          { field: "error", old: null, new: error.message },
          { field: "params", old: null, new: JSON.stringify(req.params) },
        ],
        `Ошибка при удалении контент-блока ${req.params.id}: ${error.message}`,
      );
      next(err);
    }
  };

  /**
   * Активация/деактивация блока.
   * PATCH /api/content-blocks/:id/toggle-active
   */
  toggleActive = async (
    req: ToggleActiveReq,
    res: Response<ApiResponse<IContentBlockDocument>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const userId = req.user.id;

      if (typeof isActive !== "boolean") {
        throw ApiError.BadRequest("Поле isActive должно быть boolean");
      }

      const updated = await this.contentBlockService.toggleActive(id, isActive);

      await auditLogger.logAdminEvent(
        userId,
        req.user.email,
        req.user.role,
        "CONTENT_BLOCK_MANAGEMENT",
        isActive ? "ACTIVATE_BLOCK" : "DEACTIVATE_BLOCK",
        { id, email: "system@contentblock" },
        [{ field: "status", old: !isActive, new: isActive }],
        `Контент-блок "${updated.title}" ${isActive ? "активирован" : "деактивирован"}`,
      );

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Получение статистики по блокам.
   * GET /api/content-blocks/stats
   */
  getStats = async (
    req: GetStatsReq,
    res: Response<
      ApiResponse<{
        total: number;
        active: number;
        inactive: number;
        withImages: number;
        withButtons: number;
        withoutImages: number;
        withoutButtons: number;
      }>
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const stats = await this.contentBlockService.getStats();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  };
}

export default new ContentBlockController();
