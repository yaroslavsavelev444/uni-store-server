// В src/routes/healthcheckRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ping } = require('../redis/redis.client');

router.get('/healthcheck', async (req, res) => {
  const checks = {
    app: true,
    database: false,
    redis: false
  };

  try {
    // Проверка MongoDB
    await mongoose.connection.db.admin().ping();
    checks.database = true;
    
    // Проверка Redis
     const pong = await ping();
    checks.redis = pong === 'PONG';
    
    // Общий статус
    const status = checks.database && checks.redis ? 'ok' : 'degraded';
    
    return res.status(200).json({
      status,
      ...checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'down',
      error: error.message,
      ...checks,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;