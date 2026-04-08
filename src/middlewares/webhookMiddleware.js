const ApiError = require('../exceptions/api-error');

const ALLOWED_IPS = [
  '185.59.216.65',
  '185.59.217.65',
];

function ipInCIDR(ip, cidr) {
  // Только IPv4
  if (!ip || !cidr.includes('.')) return false;
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - bits) - 1);
  const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

module.exports = function (req, res, next) {
  let clientIp = req.ip || req.connection.remoteAddress;
  clientIp = clientIp.replace(/^::ffff:/, ''); // убираем IPv4-mapped

  const allowed = ALLOWED_IPS.some((cidr) => {
    if (cidr.includes(':')) {
      // IPv6: префикс 2a02:5180::/32
      return clientIp.toLowerCase().startsWith('2a02:5180:');
    }
    return ipInCIDR(clientIp, cidr);
  });

  if (!allowed) {
    return next(ApiError.ForbiddenError(`Access denied for webhook (IP not allowed): ${clientIp}`, req));
  }

  next();
};