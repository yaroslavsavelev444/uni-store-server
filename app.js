import express from "express";

import loadMiddlewares from "./loaders/middlewares";
import loadRoutes from "./loaders/routes";
import errorHandler from "./src/error/error";

const app = express();

loadMiddlewares(app);

// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

export default app;
