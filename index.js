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
const errorHandler = require("./src/error/error");
const logger = require("./src/logger/logger");
const { connectDB } = require("./src/config/mongo");

const auditConfig = require("./config/audit-config");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3010;
const HOST = "0.0.0.0";

/* =========================
   ENV (ОБЯЗАТЕЛЬНО РАНО)
========================= */

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const auditEnvConfig =
  auditConfig[NODE_ENV] || auditConfig.development;

/* =========================
   CORS
========================= */

const allowedOriginsProd = [
  "https://api.npo-polet.ru",
  "https://npo-polet.ru",
  "https://www.api.npo-polet.ru",
];

const allowedOriginsDev = [
  "http://localhost:5173",
  "http://localhost:3000",
];

const allowedOrigins = isProd
  ? allowedOriginsProd
  : allowedOriginsDev;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl / postman / mobile
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ['Refresh-Token'], // Добавьте эту строку

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

/* =========================
   MIDDLEWARE
========================= */

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(cors(corsOptions));
app.use(express.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());
app.use(useragent.express());

/* =========================
   LOGGING
========================= */

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} | IP: ${req.ip}`);
  next();
});

/* =========================
   CONTEXT + AUDIT
========================= */

const requestContextMiddleware = require("./src/middlewares/request-context-middleware");
const auditRequestMiddleware = require("./src/middlewares/audit-request-middleware");

app.use(requestContextMiddleware);
app.use(auditRequestMiddleware(auditEnvConfig));

/* =========================
   STATIC
========================= */

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   ROUTES
========================= */

const authRoutes = require("./src/routes/authRoutes"); //прмер
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
const feedbackRoutes = require("./src/routes/feedbackRoutes");
const fileRoutes = require("./src/routes/filesRoutes");
const faqRoutes = require("./src/routes/faqRoutes");
const usersRoutes = require("./src/routes/usersRoutes");
const wishlistRoutes = require("./src/routes/wishlistRoutes");
const companyRoutes = require("./src/routes/companyRoutes");
const deliveryRoutes = require("./src/routes/deliveryRoutes");
const contentBlockRoutes = require("./src/routes/contentBlockRoutes");
const consentRoutes = require("./src/routes/consentRoutes");
const sitemapRoutes = require("./src/routes/sitemapRoutes");
const refundRoutes = require("./src/routes/refundRoutes");
const bannerRoutes = require("./src/routes/bannerRoutes");
const bannerStats = require("./src/routes/bannerStatsRoutes");
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
app.use("/bannerStats", bannerStats);
app.use("/refund", refundRoutes);
app.use("/sitemap", sitemapRoutes);
app.use("/content-blocks", contentBlockRoutes);
app.use("/users", usersRoutes);
app.use("/banners", bannerRoutes);
app.use("/delivery", deliveryRoutes);
app.use("/promoBlocks", promoBlocksRoutes);
app.use("/orders", ordersRoutes);
app.use("/cart", authMiddleware(["all"]), cartRoutes);
app.use("/wishlist", authMiddleware(["all"]), wishlistRoutes);
app.use("/admin/queues", bullBoardRouter);
app.use("/admin", authMiddleware(["admin"]), adminRoutes);

/* =========================
   PING / TEST
========================= */

app.all("/ping", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") return res.status(200).end();
  res.send(`pong ${Date.now()}`);
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend доступен" });
});

app.use(errorHandler);

/* =========================
   DB + SOCKET + SERVER
========================= */

(async () => {
  try {
    await connectDB();

    initSocket(server, {
      corsOrigins: allowedOrigins,
    });

    cronInit.initialize();

    server.listen(PORT, HOST, () => {
      logger.info(
        `🚀 Server (${NODE_ENV}) running on http://${HOST}:${PORT}`
      );
    });
  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}`);
    process.exit(1);
  }
})();