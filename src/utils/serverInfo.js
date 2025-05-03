const os = require('os');
require('dotenv').config();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return '127.0.0.1';
}

const HOST_TYPE = process.env.HOST_TYPE || 'localhost';
let host;
switch (HOST_TYPE) {
  case 'ip':
    host = getLocalIP();
    break;
  case 'localhost':
    host = '127.0.0.1';
    break;
  case 'any':
    host = '0.0.0.0';
    break;
  default:
    host = '127.0.0.1';
}

const PORT = process.env.PORT || 3000;

module.exports = {
  host,
  port: PORT,
  fullAddress: `http://${host}:${PORT}`,
};