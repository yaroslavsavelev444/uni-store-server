const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');

router.post('/sendContactForm', contactsController.submitContacts);

module.exports = router;