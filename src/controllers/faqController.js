// controllers/faqController.js
import faqService from "../services/faqService.js";

const {
  addQuestion: _addQuestion,
  createTopic: _createTopic,
  deleteQuestion: _deleteQuestion,
  deleteTopic: _deleteTopic,
  getAllFaqForAdmin: _getAllFaqForAdmin,
  getPublicFaq: _getPublicFaq,
  reorderQuestions: _reorderQuestions,
  reorderTopics: _reorderTopics,
  updateQuestion: _updateQuestion,
  updateTopic: _updateTopic,
} = faqService;

class FaqController {
  async getPublicFaq(req, res, next) {
    try {
      const data = await _getPublicFaq();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getAllFaqForAdmin(req, res, next) {
    try {
      const data = await _getAllFaqForAdmin();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  async createTopic(req, res, next) {
    try {
      const topic = await _createTopic(req.body);
      res.status(201).json({ success: true, data: topic });
    } catch (e) {
      next(e);
    }
  }

  async updateTopic(req, res, next) {
    try {
      const topic = await _updateTopic(req.params.id, req.body);
      res.json({ success: true, data: topic });
    } catch (e) {
      next(e);
    }
  }

  async deleteTopic(req, res, next) {
    try {
      await _deleteTopic(req.params.id);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async addQuestion(req, res, next) {
    try {
      const q = await _addQuestion(req.params.topicId, req.body);
      res.status(201).json({ success: true, data: q });
    } catch (e) {
      next(e);
    }
  }

  async updateQuestion(req, res, next) {
    try {
      const q = await _updateQuestion(
        req.params.topicId,
        req.params.questionId,
        req.body,
      );
      res.json({ success: true, data: q });
    } catch (e) {
      next(e);
    }
  }

  async deleteQuestion(req, res, next) {
    try {
      await _deleteQuestion(req.params.topicId, req.params.questionId);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async reorderTopics(req, res, next) {
    try {
      await _reorderTopics(req.body.orders);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async reorderQuestions(req, res, next) {
    try {
      await _reorderQuestions(req.params.topicId, req.body.orders);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
}

export default new FaqController();
