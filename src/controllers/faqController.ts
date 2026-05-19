// controllers/faq.controller.ts
import type { NextFunction, Response } from "express";
import ApiError from "../exceptions/api-error.js";
import faqService from "../services/faqService.js";
import type {
  AddQuestionReq,
  ApiResponse,
  CreateTopicReq,
  DeleteQuestionReq,
  DeleteTopicReq,
  GetAllFaqForAdminReq,
  GetPublicFaqReq,
  ReorderQuestionsReq,
  ReorderTopicsReq,
  UpdateQuestionReq,
  UpdateTopicReq,
} from "../types/controllers/faq-controller.js";
import type { IFaqQuestion, IFaqTopic } from "../types/faq.types.js";
import type { PublicFaqTopic } from "../types/faq-service.js";

/**
 * Контроллер FAQ.
 * Публичные методы (getPublicFaq) доступны без авторизации.
 * Административные методы требуют авторизации (req.user гарантирован).
 */
class FaqController {
  /**
   * Получение публичного FAQ (с кешированием).
   * GET /api/faq/public
   */
  getPublicFaq = async (
    req: GetPublicFaqReq,
    res: Response<ApiResponse<PublicFaqTopic[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await faqService.getPublicFaq();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получение всех тем и вопросов для администрирования.
   * GET /api/faq/admin
   */
  getAllFaqForAdmin = async (
    req: GetAllFaqForAdminReq,
    res: Response<ApiResponse<IFaqTopic[]>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await faqService.getAllFaqForAdmin();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Создание новой темы.
   * POST /api/faq/topics
   */
  createTopic = async (
    req: CreateTopicReq,
    res: Response<ApiResponse<IFaqTopic>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const topic = await faqService.createTopic(req.body);
      res.status(201).json({ success: true, data: topic });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновление темы.
   * PUT /api/faq/topics/:id
   */
  updateTopic = async (
    req: UpdateTopicReq,
    res: Response<ApiResponse<IFaqTopic>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const topic = await faqService.updateTopic(id, req.body);
      res.json({ success: true, data: topic });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удаление темы.
   * DELETE /api/faq/topics/:id
   */
  deleteTopic = async (
    req: DeleteTopicReq,
    res: Response<ApiResponse<null>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await faqService.deleteTopic(req.params.id);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Добавление вопроса в тему.
   * POST /api/faq/topics/:topicId/questions
   */
  addQuestion = async (
    req: AddQuestionReq,
    res: Response<ApiResponse<IFaqQuestion>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { topicId } = req.params;
      const question = await faqService.addQuestion(topicId, req.body);
      res.status(201).json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Обновление вопроса.
   * PUT /api/faq/topics/:topicId/questions/:questionId
   */
  updateQuestion = async (
    req: UpdateQuestionReq,
    res: Response<ApiResponse<IFaqQuestion>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { topicId, questionId } = req.params;
      const question = await faqService.updateQuestion(
        topicId,
        questionId,
        req.body,
      );
      res.json({ success: true, data: question });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Удаление вопроса.
   * DELETE /api/faq/topics/:topicId/questions/:questionId
   */
  deleteQuestion = async (
    req: DeleteQuestionReq,
    res: Response<ApiResponse<null>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { topicId, questionId } = req.params;
      await faqService.deleteQuestion(topicId, questionId);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Изменение порядка тем.
   * POST /api/faq/topics/reorder
   */
  reorderTopics = async (
    req: ReorderTopicsReq,
    res: Response<ApiResponse<null>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { orders } = req.body;
      if (!Array.isArray(orders)) {
        throw ApiError.BadRequest(
          "Неверный формат данных: ожидается массив orders",
        );
      }
      await faqService.reorderTopics(orders);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Изменение порядка вопросов внутри темы.
   * POST /api/faq/topics/:topicId/questions/reorder
   */
  reorderQuestions = async (
    req: ReorderQuestionsReq,
    res: Response<ApiResponse<null>>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { topicId } = req.params;
      const { orders } = req.body;
      if (!Array.isArray(orders)) {
        throw ApiError.BadRequest(
          "Неверный формат данных: ожидается массив orders",
        );
      }
      await faqService.reorderQuestions(topicId, orders);
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  };
}

export default new FaqController();
