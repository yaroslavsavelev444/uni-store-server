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
  authMiddleware({
    allowedRoles: ["all"],
    optional: false,
    checkBlock: true,
  }),
  multerMiddleware({
    fields: "files",
    maxFileSizeMB: 60,
    useTemp: true,
    imagesOnly: false,
  }),
  uploadFiles as any,
);

router.get("/:fileId", authMiddleware.optional(["all"]), serveFile as any);

router.delete("/:fileId", authMiddleware.requireAuth(), deleteFile as any);

export default router;
