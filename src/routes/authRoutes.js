const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth-middleware');
const rateLimitPasswordChange = require('../middleware/rateLimitPasswordChange');

router.post('/registration',  authController.registerUser);
router.post('/login',authController.loginUser);
router.post('/logout', authController.logoutUser);
router.get('/refresh', authController.refresh);

router.post('/checkEmailVerified', authController.checkVerifiedEmail);
router.get('/verifyEmail', authController.verifyEmail);
router.post('/isEmailExists', authController.isEmailExists);
router.post('/checkVerifyStatus', authController.checkVerifyStatus);

//ПАРОЛИ
router.post('/changePassword', authMiddleware, rateLimitPasswordChange, authController.changePassword);
router.post('/forgotPassword' ,authController.forgotPassword);
router.post('/resetForgottenPassword',  authController.resetForgottenPassword);
router.get('/verify-reset-password', authController.verifyResetPassword);

module.exports = router;