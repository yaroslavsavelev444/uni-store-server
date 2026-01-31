const express = require("express");
const path = require("path");

const loadMiddlewares = require("./loaders/middlewares");
const loadRoutes = require("./loaders/routes");
const errorHandler = require("./src/error/error");

const app = express();

loadMiddlewares(app);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

loadRoutes(app);

app.all("/ping", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") return res.status(200).end();
  res.send(`pong ${Date.now()}`);
});

app.get("/api/test", (_, res) => {
  res.json({ message: "Backend доступен" });
});

app.use(errorHandler);

module.exports = app;