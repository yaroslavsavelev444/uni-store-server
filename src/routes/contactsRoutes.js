const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');

router.post('/submit', contactsController.submitContacts);

module.exports = router;