const getIp = (req) => {
  if (!req) {
    console.error('getIp called with undefined req');
    return 'unknown';
  }
  
  return (
    req.headers?.["x-forwarded-for"]?.split(",").shift() || // если за прокси
    req.socket?.remoteAddress || 
    'unknown'
  );
};

module.exports = getIp;