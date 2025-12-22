const ApiError = require("../exceptions/api-error");
const logger = require("../logger/logger");
const {
  RoomModel,
  MessageModel,
  UserModel,
  ProductModel,
} = require("../models/index.models");
const mongoose = require("mongoose");
const { Types } = require("mongoose");
const {
  emitMessageToReceiver,
} = require("../socket/socketServer");
const {
  encryptForStorage,
  decryptFromStorage,
} = require("./encryptionService");
const path = require('path');
const fs = require('fs');

class ChatService {
  async getChats(userId) {
    try {
      const rooms = await RoomModel.find({
        users: userId,
      })
       .sort({ createdAt: -1 })
        .populate("users", "name avatar role")
        .populate("product", "title price inn photos")
        .populate("lastMessage.sender", "name")
        .lean();

      const chats = await Promise.all(
        rooms.map(async (room) => {
          const entry = room.unreadCounts?.find(
            (u) => u.userId.toString() === userId.toString()
          );

          const unreadCount = entry ? entry.count : 0;
    
          if (room.lastMessage?.text) {
            try {
              room.lastMessage.text = await decryptFromStorage(
                room.lastMessage.text
              );
            } catch (e) {
              logger.error(
                `Failed to decrypt lastMessage in room ${room._id}: ${e.message}`
              );
              room.lastMessage.text = "[encrypted:failed_to_decrypt]";
            }
          }

          return {
            ...room,
            unreadCount,
          };
        })
      );

      return {
        chats,
      };
    } catch (error) {
      logger.error(`ChatService.getChats: ${error.message}`);
      throw error instanceof ApiError
        ? error
        : ApiError.InternalServerError("Failed to fetch chats");
    }
  }

  async getMessagesByUsers(
    userId,
    receiverId,
    productId,
    { limit = 1000, offset = 0 }
  ) {
    console.log("getMessagesByUsers", userId, receiverId, productId);

    try {
      const query = {
        users: { $in: [userId] },
      };

      if (productId && productId !== 'undefined' && Types.ObjectId.isValid(productId)) {
        query.product = new Types.ObjectId(productId);
      } else {
        query.product = { $eq: null };
      }

      const room = await RoomModel.findOne(query)
        .populate("product", "title price photos inn")
        .populate("users", "id name avatar");

      if (!room) return { messages: [], product: null };

      if (!room.users.some((u) => u._id.equals(userId))) {
        throw ApiError.ForbiddenError("Access denied to this chat");
      }

      const userObjectId = new Types.ObjectId(userId);
      const receiverObjectId = receiverId
        ? new Types.ObjectId(receiverId)
        : null;

      const messageQuery = {
        room: room._id,
        $or: [
          { receiver: userObjectId },
          ...(receiverObjectId ? [{ receiver: receiverObjectId }] : []),
          { receiver: null },
          { sender: userObjectId }
        ],
      };

      const messages = await MessageModel.find(messageQuery)
        .sort({ createdAt: 1 })
        .skip(offset)
        .limit(limit)
        .populate("sender", "id name avatar")
        .populate("receiver", "id name avatar")
        .lean();

      const decryptedMessages = await Promise.all(
        messages.map(async (msg) => {
          try {
            if (msg.text) {
              msg.text = await decryptFromStorage(msg.text);
            }
          } catch (e) {
            logger.error(`Failed to decrypt message ${msg._id}: ${e.message}`);
            msg.text = "[encrypted:failed_to_decrypt]";
          }
          return msg;
        })
      );

      return {
        messages: decryptedMessages,
        product: room.product || null,
        room: room,
      };
    } catch (error) {
      logger.error(`ChatService.getMessagesByUsers: ${error.message}`);
      throw error instanceof ApiError
        ? error
        : ApiError.InternalServerError("Failed to fetch messages");
    }
  }

  async sendMessage(chatId, senderId, { text, image, receiverId, command }, productId, data) {
    
    const senderObjectId = new Types.ObjectId(senderId);
    let receiverObjectId = null;
    let receiverUser = null;

    if (!text && !image) {
      throw ApiError.BadRequest("Message must contain text or image");
    }

    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      throw ApiError.BadRequest("Invalid senderId");
    }

    if (receiverId && !mongoose.Types.ObjectId.isValid(receiverId)) {
      throw ApiError.BadRequest("Invalid receiverId");
    }

    if (chatId && !mongoose.Types.ObjectId.isValid(chatId)) {
      throw ApiError.BadRequest("Invalid chatId");
    }

    if (receiverId && senderId.toString() === receiverId.toString()) {
      throw ApiError.BadRequest("Cannot send message to yourself");
    }

    if (receiverId) {
      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        throw ApiError.BadRequest("Invalid receiverId");
      }

      receiverObjectId = new Types.ObjectId(receiverId);
      receiverUser = await UserModel.findById(receiverObjectId);
      if (!receiverUser) {
        throw ApiError.NotFoundError("Receiver not found");
      }
    }

    let room = null;

    if (chatId) {
      room = await RoomModel.findById(chatId);
      if (!room) {
        throw ApiError.NotFoundError("Chat not found");
      }
    }

    if (!room) {
      if (!receiverId || !productId) {
        console.log('receiverId и productId', receiverId, productId);
        throw ApiError.BadRequest(
          "receiverId и productId обязательны при создании нового чата"
        );
      }

      const productObjectId = new Types.ObjectId(productId);
      const product = await ProductModel.findById(productObjectId);
      if (!product) throw ApiError.NotFoundError("Product not found");

      room = await RoomModel.findOne({
        product: productObjectId,
        users: { $all: [senderObjectId, receiverObjectId] },
      }).exec();

      if (!room) {
        console.log(
          `Creating new room for users: ${senderId}, ${receiverId} with product: ${productId}`
        );
        room = new RoomModel({
          users: [senderObjectId, receiverObjectId],
          product: productObjectId,
        });
        console.log("DEBUG room.users before save:", room.users);
        await room.save();
        await room.populate("product", "title price");
      }
    }

    if (!room.users.some((u) => u.equals(senderId))) {
      throw ApiError.ForbiddenError("Sender is not a participant of this chat");
    }

    let finalReceiverId = null;

    if (receiverId) {
      if (!room.users.some((u) => u.equals(receiverId))) {
        throw ApiError.BadRequest(
          "Receiver is not a participant of this chat"
        );
      }
      finalReceiverId = receiverId.toString();
    } else {
      const other = room.users.find((u) => !u.equals(senderId));
      finalReceiverId = other ? other.toString() : null;
    }

    let finalImagePath = image;
    if (image) {
      const tempAbsolutePath = path.join(__dirname, "..", image);
      const ext = path.extname(image);
      const roomFolder = path.join(__dirname, "..", "uploads", "rooms", room._id.toString());
      if (!fs.existsSync(roomFolder)) fs.mkdirSync(roomFolder, { recursive: true });
      const fileName = `${Date.now()}${ext}`;
      const finalAbsolutePath = path.join(roomFolder, fileName);

      fs.renameSync(tempAbsolutePath, finalAbsolutePath);

      finalImagePath = `/uploads/rooms/${room._id.toString()}/${fileName}`;
    }

    const messageData = {
      room: room._id,
      sender: senderId,
      image: finalImagePath,
      command,
      text: text ? await encryptForStorage(text) : undefined,
    };

    if (finalReceiverId) {
      messageData.receiver = finalReceiverId;
    }

    const message = new MessageModel(messageData);
    await message.save();

    room.lastMessage = {
      sender: senderId,
      text: text ? await encryptForStorage(text) : image ? "Фото" : "",
      createdAt: message.createdAt,
    };

    await room.save();

    if (finalReceiverId) {
      await this.ensureUnreadEntry(room._id, finalReceiverId);
      await this.incrementUnreadForReceiver(room._id, finalReceiverId);
    }

    let receiverIds;
    if (finalReceiverId) {
      receiverIds = [finalReceiverId];
    } else {
      receiverIds = room.users
        .filter((u) => !u.equals(senderId))
        .map((u) => u.toString());
    }

    await message.populate("sender", "id name avatar");
    await message.populate("receiver", "id name avatar");

    for (const rid of receiverIds) {
      await emitMessageToReceiver({
        senderId,
        receiverId: rid,
        message: await decryptFromStorage(message.text),
        roomId: room._id.toString(),
      });
    }

    return {
      ...message.toObject(),
      text: await decryptFromStorage(message.text),
      get: finalImagePath, 
    };
  }

  async markRoomAsRead(roomId, userId) {
    await RoomModel.updateOne(
      {
        _id: roomId,
        "unreadCounts.userId": userId
      },
      {
        $set: { "unreadCounts.$.count": 0 }
      }
    );

    return { success: true };
  }

  async getUserUnreadTotal(userId) {
    const rooms = await RoomModel.find(
      { "unreadCounts.userId": userId },
      { unreadCounts: 1 }
    ).lean();

    let total = 0;

    for (const room of rooms) {
      const entry = room.unreadCounts?.find(
        (u) => u.userId.toString() === userId.toString()
      );
      if (entry?.count) total += entry.count;
    }

    return total;
  }

  async _getUnreadCounts(roomIds, userId) {
    const results = await MessageModel.aggregate([
      {
        $match: {
          room: { $in: roomIds },
          receiver: userId,
          read: false,
        },
      },
      {
        $group: {
          _id: "$room",
          count: { $sum: 1 },
        },
      },
    ]);

    return results.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});
  }

  async ensureUnreadEntry(roomId, userId) {
    await RoomModel.updateOne(
      {
        _id: roomId,
        "unreadCounts.userId": { $ne: userId }
      },
      {
        $push: { unreadCounts: { userId, count: 0 } }
      }
    );
  }

  async incrementUnreadForReceiver(roomId, receiverId) {
    if (!roomId || !receiverId) return;

    await RoomModel.updateOne(
      {
        _id: roomId,
        "unreadCounts.userId": receiverId
      },
      { 
        $inc: { "unreadCounts.$.count": 1 } 
      }
    );
  }
}

module.exports = new ChatService();