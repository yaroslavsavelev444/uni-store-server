const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');
const { contactFormLimiter } = require('../utils/limiters');

router.post(
  '/sendContactForm',
  contactFormLimiter, // сначала лимитер
  contactsController.submitContacts // потом обработчик
);

module.exports = router;