
const events = require("events");
events.EventEmitter.defaultMaxListeners = 20;

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const useragent = require("express-useragent");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const http = require("http");
const path = require("path");
const cronInit = require("./src/cron/index");
const { initSocket } = require("./src/socket/socketServer");
// const corsOptions = require("./src/cors/cors");
const errorHandler = require("./src/error/error");
const logger = require("./src/logger/logger");
const { connectDB } = require("./src/config/mongo");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3010;
const HOST = "0.0.0.0"; // критично для Expo/мобилок

// Middleware безопасности
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(express.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());

// Подключаем CORS
const allowedOrigins = [
  "http://localhost:5173",
        "http://localhost:3000",
        "http://192.168.1.128:5173",
        "http://192.168.1.128:3001",
        "http://192.168.1.128:3003",
        "http://192.168.1.203:3003",
        "http://192.168.1.203:19006",
        "exp://192.168.1.203:19000",
        "https://npo-polet.store",    
        "https://npo-polet.ru",  
        "https://www.npo-polet.store",   
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // curl/postman
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true, // обязательно для cookie
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Refresh-Token",
    "X-Device-Platform",
    "X-Device-ID",
    "X-App-Version",
    "X-User-Agent",
    "X-Timestamp",
  ],
};
app.use(cors(corsOptions));

app.use(useragent.express());

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`Запрос: ${req.method} ${req.url} | IP: ${req.ip}`);
  next();
});

// --- Artificial delay middleware (for testing skeletons) ---
// app.use(async (req, res, next) => {
//   const delayMs = 2000; // 4 секунды задержки для всех запросов
//   await new Promise((resolve) => setTimeout(resolve, delayMs));
//   next();
// });
// ---ROUTES---
const authRoutes = require("./src/routes/authRoutes");
const productsRoutes = require("./src/routes/productsRoutes");
const contactsRoutes = require("./src/routes/contactsRoutes");
const reviewsRoutes = require("./src/routes/reviewsRoutes");
const promoBlocksRoutes = require("./src/routes/promoBlocksRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const topicRoutes = require("./src/routes/topicRoutes");
const cartRoutes = require("./src/routes/cartRoutes");
const notificationsRoutes = require("./src/routes/notificationsRoutes");
const categoriesRoutes = require("./src/routes/categoriesRoutes");
const ordersRoutes = require("./src/routes/ordersRoutes");
const bullBoardRouter = require("./src/queues/bullBoard");
const healthcheckRoutes = require("./src/routes/healthcheckRoutes");
const authMiddleware = require("./src/middlewares/auth-middleware");
const auditConfig = require("./config/audit-config");
const feedbackRoutes = require("./src/routes/feedbackRoutes");
const fileRoutes = require("./src/routes/filesRoutes");
const faqRoutes = require("./src/routes/faqRoutes");
const usersRoutes = require("./src/routes/usersRoutes");
const wishlistRoutes = require("./src/routes/wishlistRoutes");
const companyRoutes = require("./src/routes/companyRoutes");
const deliveryRoutes = require("./src/routes/deliveryRoutes");
const contentBlockRoutes = require("./src/routes/contentBlockRoutes");
const requestContextMiddleware = require("./src/middlewares/request-context-middleware");
const auditRequestMiddleware = require("./src/middlewares/audit-request-middleware");
const consentRoutes = require("./src/routes/consentRoutes");
const sitemapRoutes = require("./src/routes/sitemapRoutes");

const env = process.env.NODE_ENV;
const config = auditConfig[env] || auditConfig.development;

// Добавляем контекст запроса (должен быть первым)
app.use(requestContextMiddleware);

// Добавляем аудит middleware (должен быть после контекста, но до основных роутов)
app.use(auditRequestMiddleware(config));

app.use("/uploads", express.static(path.join(__dirname, "src/uploads")));

app.use("/auth", authRoutes);
app.use("/health", healthcheckRoutes);
app.use("/consent", consentRoutes);
app.use("/contacts", contactsRoutes);
app.use("/notifications", authMiddleware(["all"]), notificationsRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/topics", topicRoutes);
app.use("/files", fileRoutes);
app.use("/categories", categoriesRoutes);
app.use("/products", productsRoutes);
app.use("/reviews", reviewsRoutes);
app.use("/company", companyRoutes);
app.use("/faq", faqRoutes);
app.use("/sitemap", sitemapRoutes);
app.use("/content-blocks", contentBlockRoutes);
app.use("/users", usersRoutes);
app.use("/delivery", deliveryRoutes);
app.use("/promoBlocks", promoBlocksRoutes);
app.use("/orders", ordersRoutes);
app.use("/cart", authMiddleware(["all"]), cartRoutes);
app.use("/wishlist", authMiddleware(["all"]), wishlistRoutes);
app.use("/admin/queues", bullBoardRouter);
app.use("/admin", authMiddleware(["admin"]), adminRoutes);

app.all("/ping", (req, res) => {
  // Быстрый ответ без обращения к БД
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  // HEAD-запрос → только заголовки без тела
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  // GET-запрос → можно вернуть доп. информацию
  return res.status(200).send(`pong ${Date.now()}`);
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend доступен" });
});

app.use(errorHandler);

// --- DB + Socket ---
(async () => {
  try {
    await connectDB();

    // Socket.io init
    initSocket(server, { corsOrigins: allowedOrigins
    });

    cronInit.initialize();

    server.listen(PORT, HOST, () => {
      logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}`);
    process.exit(1);
  }
})();
