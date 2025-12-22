const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const multerMiddleware = require("../middlewares/multerMiddleware");

router.get("/:type", chatController.getChats);
router.get("/:receiverId/:listingId/messages", chatController.getMessages);

router.post(
  "/sendmessage",
  multerMiddleware({
    fields: "files",
    uploadDir: "messages",
    maxFileSizeMB: 3,
    imagesOnly: true,
    useTemp: true,
  }),
  chatController.sendMessage
);

router.post(
  "/upload-temp-image",
  multerMiddleware({
    fields: "files",
    uploadDir: "messages",
    maxFileSizeMB: 5,
    imagesOnly: true,
    useTemp: true,
  }),
  chatController.uploadTempImage
);

router.delete("/remove-temp-image", chatController.removeTempImage);
router.put("/messages/read", chatController.markMessagesAsRead);
router.get("/rooms/getUserUnreadTotal", chatController.getUserUnreadTotal);

module.exports = router;
