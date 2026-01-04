const express = require("express");
const router = express.Router();
const filesController = require("../controllers/filesController");
const multerMiddleware = require("../middlewares/multerMiddleware");
const authMiddleware = require("../middlewares/auth-middleware");


router.post(
  "/upload",
  authMiddleware(["all"]),
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