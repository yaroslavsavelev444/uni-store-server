// routes/faq.routes.js
const express = require('express');
const faqController = require('../controllers/faqController');
const authMiddleware = require('../middlewares/auth-middleware');

const router = express.Router();

// public
router.get('/', faqController.getPublicFaq);

// admin
router.use(authMiddleware(['admin']));

router.get('/admin', faqController.getAllFaqForAdmin);

router.post('/topics', faqController.createTopic);
router.put('/topics/:id', faqController.updateTopic);
router.delete('/topics/:id', faqController.deleteTopic);

router.post('/topics/:topicId/questions', faqController.addQuestion);
router.put('/topics/:topicId/questions/:questionId', faqController.updateQuestion);
router.delete('/topics/:topicId/questions/:questionId', faqController.deleteQuestion);

router.put('/reorder/topics', faqController.reorderTopics);
router.put('/topics/:topicId/reorder/questions', faqController.reorderQuestions);

module.exports = router;