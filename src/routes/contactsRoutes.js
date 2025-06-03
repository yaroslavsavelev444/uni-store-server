const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');
const { contactFormLimiter } = require('../utils/limiters');

router.post(
  '/sendContactForm',
  contactFormLimiter, 
  contactsController.submitContacts 
);

module.exports = router;