const { Router } = require("express");
const {
  deleteFile,
  serveFile,
  uploadFiles,
} = require("../controllers/filesController.js");
const authMiddleware = require("../middlewares/auth-middleware.js");
const multerMiddleware = require("../middlewares/multerMiddleware.js");

const router = Router();

router.post(
  "/upload",
  authMiddleware(["all"]),
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 30,
    useTemp: true,
  }),
  uploadFiles,
);

router.get("/:fileId", authMiddleware.optional(["all"]), serveFile);

router.delete("/:fileId", authMiddleware(["all"]), deleteFile);

module.exports = router;