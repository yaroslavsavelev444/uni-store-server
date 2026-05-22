// controllers/faqController.js
const faqService = require('../services/faqService');

class FaqController {
  async getPublicFaq(req, res, next) {
    try {
      const data = await faqService.getPublicFaq();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getAllFaqForAdmin(req, res, next) {
    try {
      const data = await faqService.getAllFaqForAdmin();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  async createTopic(req, res, next) {
    try {
      const topic = await faqService.createTopic(req.body);
      res.status(201).json({ success: true, data: topic });
    } catch (e) {
      next(e);
    }
  }

  async updateTopic(req, res, next) {
    try {
      const topic = await faqService.updateTopic(req.params.id, req.body);
      res.json({ success: true, data: topic });
    } catch (e) {
      next(e);
    }
  }

  async deleteTopic(req, res, next) {
    try {
      await faqService.deleteTopic(req.params.id);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async addQuestion(req, res, next) {
    try {
      const q = await faqService.addQuestion(req.params.topicId, req.body);
      res.status(201).json({ success: true, data: q });
    } catch (e) {
      next(e);
    }
  }

  async updateQuestion(req, res, next) {
    try {
      const q = await faqService.updateQuestion(
        req.params.topicId,
        req.params.questionId,
        req.body
      );
      res.json({ success: true, data: q });
    } catch (e) {
      next(e);
    }
  }

  async deleteQuestion(req, res, next) {
    try {
      await faqService.deleteQuestion(req.params.topicId, req.params.questionId);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async reorderTopics(req, res, next) {
    try {
      await faqService.reorderTopics(req.body.orders);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }

  async reorderQuestions(req, res, next) {
    try {
      await faqService.reorderQuestions(req.params.topicId, req.body.orders);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new FaqController();