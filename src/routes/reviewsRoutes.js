const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviewsController');

router.post('/addProductReview', reviewsController.addProductReview);
router.post('/addOrgReview', reviewsController.addOrgReview);
router.get('/getProductReviews', reviewsController.getProductReviews);
router.get('/getUserReviews', reviewsController.getUserReviews);
router.get('/getOrgReviews', reviewsController.getOrgReviews);

module.exports = router;