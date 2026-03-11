import authMiddleware from "../src/middlewares/auth-middleware";

export default (app) => {
  app.use("/auth", require("../src/routes/authRoutes"));
  app.use("/health", require("../src/routes/healthcheckRoutes").default);
  app.use("/consent", require("../src/routes/consentRoutes").default);
  app.use("/contacts", require("../src/routes/contactsRoutes").default);
  app.use(
    "/notifications",
    authMiddleware(["all"]),
    require("../src/routes/notificationsRoutes").default,
  );
  app.use("/feedback", require("../src/routes/feedbackRoutes").default);
  app.use("/topics", require("../src/routes/topicRoutes").default);
  app.use("/files", require("../src/routes/filesRoutes").default);
  app.use("/categories", require("../src/routes/categoriesRoutes").default);
  app.use("/products", require("../src/routes/productsRoutes"));
  app.use("/reviews", require("../src/routes/reviewsRoutes").default);
  app.use("/company", require("../src/routes/companyRoutes").default);
  app.use("/faq", require("../src/routes/faqRoutes").default);
  app.use("/bannerStats", require("../src/routes/bannerStatsRoutes").default);
  app.use("/refund", require("../src/routes/refundRoutes").default);
  app.use("/sitemap", require("../src/routes/sitemapRoutes").default);
  app.use(
    "/content-blocks",
    require("../src/routes/contentBlockRoutes").default,
  );
  app.use("/users", require("../src/routes/usersRoutes").default);
  app.use("/banners", require("../src/routes/bannerRoutes").default);
  app.use("/delivery", require("../src/routes/deliveryRoutes").default);
  app.use("/discounts", require("../src/routes/discountRoutes").default);
  app.use("/promoBlocks", require("../src/routes/promoBlocksRoutes").default);
  app.use("/orders", require("../src/routes/ordersRoutes").default);
  app.use(
    "/cart",
    authMiddleware(["all"]),
    require("../src/routes/cartRoutes").default,
  );
  app.use(
    "/wishlist",
    authMiddleware(["all"]),
    require("../src/routes/wishlistRoutes").default,
  );
  app.use("/admin/queues", require("../src/queues/bullBoard"));
  app.use(
    "/admin",
    authMiddleware(["admin"]),
    require("../src/routes/adminRoutes").default,
  );
};
