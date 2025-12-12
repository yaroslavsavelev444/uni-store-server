const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const jwt = require("jsonwebtoken");
const logger = require("../logger/logger");
const redisClient = require("../redis/redis.client");
const { getSocketEmitter } = require("./socketEmitter");
const ApiError = require("../exceptions/api-error");

let io;

// userSocketMap: { userId: [socketId1, socketId2, ...] }
const userSocketMap = {};
const socketUserMap = {};

/** Добавление сокета пользователя */
async function addUserSocket(userId, socketId) {
  const uid = userId.toString();
  if (!userSocketMap[uid]) userSocketMap[uid] = [];
  if (!userSocketMap[uid].includes(socketId)) userSocketMap[uid].push(socketId);
  socketUserMap[socketId] = uid;

  try {
    // сохраняем поле = timestamp (чтобы иметь возможность узнать, когда последний сокет появился)
    await redisClient.hset(
      `userSockets:${uid}`,
      socketId,
      Date.now().toString()
    );
  } catch (err) {
    console.error(`[Redis] Failed hset userSockets:${uid} ${socketId}`, err);
  }
}

/** Удаление сокета */
async function removeUserSocket(socketId) {
  const userId = socketUserMap[socketId];
  if (!userId) {
    // может быть уже удалён
    try {
      await redisClient.hdel(`userSockets:${userId}`, socketId);
    } catch (e) {}
    return;
  }

  userSocketMap[userId] = userSocketMap[userId].filter((id) => id !== socketId);
  if (userSocketMap[userId].length === 0) delete userSocketMap[userId];

  delete socketUserMap[socketId];

  try {
    await redisClient.hdel(`userSockets:${userId}`, socketId);
  } catch (err) {
    console.error(`[Redis] Failed hdel userSockets:${userId} ${socketId}`, err);
  }
}

async function emitMessageToReceiver({ senderId, receiverId, message, roomId }) {
  try {
    const io = getIoInstance();

    if (!message) {
      console.error("[Socket.io] No message provided");
      return;
    }

    console.log(`[Socket.io] Emitting message to ${receiverId}`, {
      senderId,
      receiverId,
      messageId: message._id || message.id,
      hasReceiverSockets: !!getUserSockets(receiverId)?.length,
    });

    // Нормализуем структуру сообщения
    const payload = {
      id: (message._id || message.id).toString(),
      text: message.text,
      sender: {
        id: message.sender?.id || message.sender?._id?.toString() || senderId,
        name: message.sender?.name || "Unknown",
        avatar: message.sender?.avatar || null,
      },
      receiver: message.receiver ? {
        id: message.receiver.id || message.receiver._id?.toString() || receiverId,
        name: message.receiver.name,
        avatar: message.receiver.avatar || null,
      } : null,
      createdAt: message.createdAt || new Date().toISOString(),
      read: message.read || false,
      roomId: roomId,
    };

    if (receiverId) {
      const receiverSockets = getReceiverSockets(receiverId);
      console.log('receiverSockets found:', receiverSockets);
      
      if (receiverSockets.length === 0) {
        console.log(`[Socket.io] No active sockets for user ${receiverId}`);
        return;
      }
      
      receiverSockets.forEach((socketId) => {
        io.to(socketId).emit("newMessage", payload);
      });
      console.log(`[Socket.io] Message delivered to ${receiverSockets.length} socket(s) for user ${receiverId}`);
    } else if (roomId) {
      io.to(roomId).emit("newMessage", payload);
    }
  } catch (err) {
    console.error(`[Socket.io] Error in emitMessageToReceiver: ${err.message}`);
  }
}
async function emitMessageToReceiverRedis({
  senderId,
  receiverId,
  message,
  roomId,
}) {
  const emitter = getSocketEmitter();

  // Нормализуем сообщение (как в оригинальном emitMessageToReceiver)
  const payload = {
    id: message._id.toString(),
    text: message.text,
    sender: {
      id: message.sender.id || message.sender._id.toString(),
      name: message.sender.name,
      avatar: message.sender.avatar || null,
    },
    receiver: message.receiver
      ? {
          id: message.receiver.id || message.receiver._id.toString(),
          name: message.receiver.name,
          avatar: message.receiver.avatar || null,
        }
      : null,
    createdAt: message.createdAt,
    read: message.read || false,
    roomId: roomId,
  };

  // Берем сокеты получателя из Redis
  const socketIds = await redisClient.hkeys(`userSockets:${receiverId}`);
  if (!socketIds || socketIds.length === 0) {
    console.error(`[emit] no sockets for ${receiverId}`);
    return;
  }
  console.log("succ");

  socketIds.forEach((sockId) => emitter.to(sockId).emit("newMessage", payload));

  console.log(
    `[emitMessageToReceiverRedis] Отправлено пользователю ${receiverId} через сокеты:`
  );
}

/** Получить сокеты пользователя */
function getUserSockets(userId) {
  return userSocketMap[userId.toString()] || [];
}

async function initSocket(server, { corsOrigins }) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // можно явно
      credentials: true,
    },
    path: "/socket",
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // ✅ правильный вариант
  const pubClient = redisClient.client;
  const subClient = pubClient.duplicate();

  // дожидаемся, пока исходный redisClient подключится
  if (!redisClient.isConnected) {
    await redisClient.connect();
  }

  subClient.on("connect", () => {
    console.log("[Socket.io] Redis subClient connected");
  });

  io.adapter(createAdapter(pubClient, subClient));

  // 🔐 Аутентификация через JWT
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Нет токена"));

      const payload = jwt.verify(token, process.env.ACCESS_TOKEN);
      socket.userId = payload.id;
      next();
    } catch (err) {
      logger.warn(`[Socket.io] Неавторизованный сокет: ${err.message}`);
      next(new Error("Неавторизован"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket;
    console.log("🟢 New socket connected:", socket.id, "User:", socket.userId);

    addUserSocket(userId, socket.id);
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    socket.on(
  "sendMessage",
  async ({ senderId, receiverId, message, roomId }) => {
    console.log(`[Socket.io] sendMessage from ${senderId} to ${receiverId}`, {
      messageId: message._id,
      text: message.text?.substring(0, 50),
    });

    try {
      // Используем единую функцию для отправки сообщений
      await emitMessageToReceiver({
        senderId,
        receiverId,
        message,
        roomId,
      });
    } catch (err) {
      console.error(`[Socket.io] Ошибка при отправке сообщения: ${err.message}`);
    }
  }
);


    socket.on("typing:start", ({ receiverId, roomId }) => {
      try {

        if (!receiverId || !roomId) return;

        if (receiverId.toString() === socket.userId.toString()) return;

        const receiverSockets = getUserSockets(receiverId);

        if (!receiverSockets.length) return console.log("Юзер не онлайн");

        console.log(`[Socket.io] typing:start from ${socket.userId} to ${receiverId}`);
        
        receiverSockets.forEach((sockId) => {
          io.to(sockId).emit("typing:start", {
            from: socket.userId,
            to: receiverId,
            roomId: roomId
          });
        });
        
      } catch (err) {
        console.error(`[Socket.io] typing:start error: ${err.message}`);
      }
    });

    socket.on("typing:stop", ({ receiverId, roomId }) => {
      try {

        if (!receiverId || !roomId) return;
        if (receiverId.toString() === socket.userId.toString()) return;

        const receiverSockets = getUserSockets(receiverId);
        if (!receiverSockets.length) return;

        console.log(`[Socket.io] typing:stop from ${socket.userId} to ${receiverId}`);
        receiverSockets.forEach((sockId) => {
          io.to(sockId).emit("typing:stop", {
            from: socket.userId,
            to: receiverId,
            roomId: roomId
          });
        });
      } catch (err) {
        console.error(`[Socket.io] typing:stop error: ${err.message}`);
      }
    });

    socket.on("heartbeat", () => {
      socket.emit("heartbeatAck", { time: Date.now() });
      console.log(`[Socket.io] Heartbeat from ${socket.id}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Отключен ${socket.id} (${reason})`);
      removeUserSocket(socket.id);
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
  });

  return io;
}

function getReceiverSockets(userId) {
  return getUserSockets(userId);
}

function getIoInstance() {
  if (!io)
    throw new Error(
      "Socket.io не инициализирован! Вызовите initSocket(server) перед использованием."
    );
  return io;
}

module.exports = {
  initSocket,
  getIoInstance,
  getReceiverSockets,
  emitMessageToReceiver,
  emitMessageToReceiverRedis,
};
