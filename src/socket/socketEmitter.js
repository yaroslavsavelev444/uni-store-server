const { createClient } = require('ioredis');
const { io: socketIoEmitter } = require('socket.io-emitter');

let emitter;

function getSocketEmitter() {
  if (!emitter) {
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    const client = createClient({ host: redisHost, port: redisPort });
    client.on('connect', () => console.log('[Emitter] Connected to Redis'));
    client.on('error', (err) => console.error('[Emitter] Redis error', err));

    emitter = socketIoEmitter(client);
  }
  return emitter;
}

module.exports = { getSocketEmitter };