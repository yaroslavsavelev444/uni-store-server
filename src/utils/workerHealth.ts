import { createServer } from "http";
import mongoose from "mongoose";

export function createHealthServer(port: number) {
  let isReady = false;
  let isHealthy = true;

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      const status = isHealthy ? 200 : 503;
      res.writeHead(status);
      res.end(isHealthy ? "OK" : "SERVICE UNAVAILABLE");
    } else if (req.url === "/ready") {
      // Реальная готовность: подключена ли БД?
      const dbReady = mongoose.connection.readyState === 1;
      const ready = isReady && dbReady;
      const status = ready ? 200 : 503;
      res.writeHead(status);
      res.end(ready ? "READY" : "NOT READY");
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Worker health server running on port ${port}`);
  });

  return {
    close: (callback?: () => void) => server.close(callback),
    setReady: (state: boolean) => {
      isReady = state;
    },
    setHealthy: (state: boolean) => {
      isHealthy = state;
    },
  };
}
