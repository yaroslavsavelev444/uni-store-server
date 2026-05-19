import { Router } from "express";
import {
  deleteFile,
  serveFile,
  uploadFiles,
} from "../controllers/filesController.js";

import authMiddleware from "../middlewares/auth-middleware.js";
import multerMiddleware from "../middlewares/multerMiddleware.js";

const router = Router();

router.post(
  "/upload",
  authMiddleware.requireAuth,
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 60,
    useTemp: true,
  }),
  uploadFiles,
);

router.get("/:fileId", authMiddleware.optional(["all"]), serveFile);

router.delete("/:fileId", authMiddleware.requireAuth, deleteFile);

export default router;
