// controllers/contacts.controller.ts
import type { NextFunction, Response } from "express";
import logger from "../logger/logger.js";
import type {
  DefaultContactStructure,
  EmptyContactStructure,
} from "../services/contactsService.js";
import contactsService from "../services/contactsService.js";
import type { IContact } from "../types/contact.types.js";
import type {
  ContactsResponse,
  ExportVCardReq,
  GetAdminContactsReq,
  GetChangeHistoryReq,
  GetContactsReq,
  HealthCheckReq,
  ToggleActiveReq,
  UpdateContactsReq,
} from "../types/controllers/contacts-controller.js";

// Объединённый тип для данных, возвращаемых сервисом
type ContactData =
  | Partial<IContact>
  | DefaultContactStructure
  | EmptyContactStructure;

class ContactsController {
  getContacts = async (
    req: GetContactsReq,
    res: Response<ContactsResponse<ContactData>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const isAdmin = !!req.user?.role?.includes("admin");
      const contacts = await contactsService.getContacts(isAdmin);

      if (!isAdmin && (!contacts || !contacts.isActive)) {
        res.json({
          success: true,
          data: contactsService.getEmptyStructureForUsers(),
          message: "Контакты временно недоступны",
        });
        return;
      }

      // Определяем версию безопасно
      const version = "version" in contacts ? contacts.version : 0;

      res.json({
        success: true,
        data: contacts,
        meta: {
          version,
          cache: !isAdmin,
          isAdmin,
        },
      });
    } catch (error) {
      logger.error("Error in getContacts:", error);
      const err = error as Error & { status?: number };
      if (err.status === 404 || err.message?.includes("не найдены")) {
        res.json({
          success: true,
          data: contactsService.getEmptyStructureForUsers(),
          message: "Контакты временно недоступны",
        });
        return;
      }
      next(error);
    }
  };

  getAdminContacts = async (
    req: GetAdminContactsReq,
    res: Response<ContactsResponse<ContactData>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const contacts = await contactsService.getContactsForAdmin();
      res.json({
        success: true,
        data: contacts,
        meta: { isAdmin: true, cache: false },
      });
    } catch (error) {
      logger.error("Error in getAdminContacts:", error);
      next(error);
    }
  };

  updateContacts = async (
    req: UpdateContactsReq,
    res: Response<ContactsResponse<IContact>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const result = await contactsService.updateContacts(req.body, userId);
      if (!result) {
        throw new Error("Failed to update contacts");
      }
      // result уже имеет тип ContactResponse, который содержит version
      const version = "version" in result ? result.version : 0;
      logger.info({
        message: "Contacts updated",
        updatedBy: userId,
        version,
      });
      res.json({
        success: true,
        message: "Контакты успешно обновлены",
        data: result,
        meta: {
          updatedBy: userId,
          version,
          cacheInvalidated: true,
          isAdmin: true,
        },
      });
    } catch (error) {
      logger.error("Error in updateContacts:", error);
      next(error);
    }
  };

  toggleActive = async (
    req: ToggleActiveReq,
    res: Response<ContactsResponse<{ isActive: boolean }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user.id;
      const isActive = await contactsService.toggleActive(userId);
      logger.info(
        `User ${userId} toggled contacts active status to ${isActive}`,
      );
      res.json({
        success: true,
        message: `Контакты ${isActive ? "активированы" : "деактивированы"}`,
        data: { isActive },
        meta: { updatedBy: userId, isAdmin: true },
      });
    } catch (error) {
      logger.error("Error in toggleActive:", error);
      next(error);
    }
  };

  getChangeHistory = async (
    req: GetChangeHistoryReq,
    res: Response<ContactsResponse<{ changes: unknown[]; total: number }>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { limit = "10" } = req.query;
      const history = await contactsService.getChangeHistory(
        parseInt(limit, 10),
      );
      res.json({
        success: true,
        data: history,
        meta: { isAdmin: true },
      });
    } catch (error) {
      logger.error("Error in getChangeHistory:", error);
      next(error);
    }
  };

  exportVCard = async (
    req: ExportVCardReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const isAdmin = !!req.user?.role?.includes("admin");
      const vCard = await contactsService.exportAsVCard(isAdmin);
      res.set({
        "Content-Type": "text/vcard",
        "Content-Disposition": 'attachment; filename="contacts.vcf"',
        "Content-Length": Buffer.byteLength(vCard, "utf8"),
      });
      res.send(vCard);
    } catch (error) {
      logger.error("Error in exportVCard:", error);
      const emptyVCard = contactsService.generateEmptyVCard();
      res.set({
        "Content-Type": "text/vcard",
        "Content-Disposition": 'attachment; filename="contacts.vcf"',
        "Content-Length": Buffer.byteLength(emptyVCard, "utf8"),
      });
      res.send(emptyVCard);
    }
  };

  healthCheck = async (
    req: HealthCheckReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const health = await contactsService.healthCheck();
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.status(statusCode).json({
        success: health.status === "healthy",
        ...health,
      });
    } catch (error) {
      logger.error("Health check failed:", error);
      res.status(503).json({
        success: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  };
}

export default new ContactsController();
