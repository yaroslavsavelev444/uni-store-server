const express = require("express");
const router = express.Router();
const filesController = require("../controllers/filesController");
const multerMiddleware = require("../middlewares/multerMiddleware");
const authMiddleware = require("../middlewares/auth-middleware");
const rateLimit = require("express-rate-limit");

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: "Слишком много запросов на загрузку файлов. Попробуйте позже.",
  skipSuccessfulRequests: false,
  skip: (req, res) => {
    return req.user && req.user.role === 'admin';
  }
});

router.post(
  "/upload",
  authMiddleware(["all"]),
  uploadLimiter,          
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 30,
    imagesOnly: false,
    useTemp: true,
  }),
  filesController.uploadFiles
);

router.post(
  "/delete",
  authMiddleware(["all"]),
  filesController.deleteFiles
);

module.exports = router;