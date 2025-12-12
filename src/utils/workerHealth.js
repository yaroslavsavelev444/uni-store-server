// src/utils/workerHealth.js
const http = require('http');

module.exports.createHealthServer = (port) => {
  let isReady = false;
  let isHealthy = true;

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const status = isHealthy ? 200 : 503;
      res.writeHead(status);
      res.end(isHealthy ? 'OK' : 'SERVICE UNAVAILABLE');
    } else if (req.url === '/ready') {
      const status = isReady ? 200 : 503;
      res.writeHead(status);
      res.end(isReady ? 'READY' : 'NOT READY');
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Worker health server running on port ${port}`);
  });

  return {
    close: (callback) => server.close(callback),
    setReady: (state) => { isReady = state; },
    setHealthy: (state) => { isHealthy = state; }
  };
};