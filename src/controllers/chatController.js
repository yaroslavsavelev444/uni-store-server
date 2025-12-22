const chatService = require("../services/chatService");
const ApiError = require("../exceptions/api-error");
const path = require("path");
const fs = require("fs");

class ChatController {
  async getChats(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await chatService.getChats(userId);
      res.status(200).json({
        result
      });
    } catch (e) {
      next(e);
    }
  }

  async getMessages(req, res, next) {
    try {
      const { chatId } = req.params;
      const { limit, offset } = req.query;
      const userId = req.user.id;

      if (!chatId || !userId) {
        throw ApiError.BadRequest("Недостаточно данных");
      }

      const { messages, product, room } = await chatService.getMessagesByUsers(
        userId,
        chatId,
        product,
        { limit, offset }
      );

      res.status(200).json({
        messages: messages,
        room,
        product
      });
    } catch (e) {
      next(e);
    }
  }

  async sendMessage(req, res, next) {
    try {
      const senderId = req.user.id;
      const {
        text,
        image,
        receiverId,
        productId,
        chatId,
        command,
        data = {},
      } = req.body;

      if (!senderId && !text) {
        throw ApiError.BadRequest("receiverId is required");
      }

      const message = await chatService.sendMessage(
        chatId,
        senderId,
        {
          text,
          image,
          receiverId,
          command,
        },
        productId,
        data
      );

      res.status(201).json(message);
    } catch (e) {
      next(e);
    }
  }

  async getUserUnreadTotal(req, res, next) {
    try {
      const userId = req.user.id;
      const result = await chatService.getUserUnreadTotal(userId);
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  }

async markMessagesAsRead(req, res, next) {
    try {
      const { roomId } = req.body;
      const userId = req.user.id;
      if(!roomId) {
        throw ApiError.BadRequest("roomId is required");
      }
      const result = await chatService.markRoomAsRead(
        roomId,
        userId
      );

      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  }

  async uploadTempImage(req, res, next) {
    try {
      if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
        throw ApiError.BadRequest("Нет файлов для загрузки");
      }

      const file = Array.isArray(req.uploadedFiles)
        ? req.uploadedFiles[0]
        : Object.values(req.uploadedFiles)[0][0];

      const tempPath = path
        .relative(path.join(__dirname, "..", "uploads"), file.path)
        .replace(/\\/g, "/");

      const clientPath = `/uploads/${tempPath}`; // добавляем uploads/ спереди

      console.log(`[UPLOAD] Временный файл сохранён: ${clientPath}`);

      return res.status(200).json({ path: clientPath });
    } catch (err) {
      next(err);
    }
  }

  async removeTempImage(req, res, next) {
    try {
      const { path: filePath } = req.body;
      if (!filePath) {
        throw ApiError.BadRequest("path is required");
      }

      const absolutePath = path.join(__dirname, "..", "uploads", filePath);

      if (!fs.existsSync(absolutePath)) {
        console.error(`[REMOVE TEMP] Файл не найден: ${absolutePath}`);
        throw ApiError.BadRequest("Файл не найден");
      }

      fs.unlinkSync(absolutePath);
      console.log(`[REMOVE TEMP] Файл удален: ${absolutePath}`);

      return res.status(200).json({ message: "Файл успешно удалён" });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ChatController();
