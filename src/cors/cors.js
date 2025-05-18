const allowedOriginsDev = ['http://localhost:5173', 'http://localhost:3000'];
const allowedOriginsProd = ['https://kpb-polet.ru']; 

const corsOptions = {
  origin: function (origin, callback) {
    // Разрешить запросы без Origin (например, мобильные клиенты, curl, Postman)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.NODE_ENV === 'production' ? allowedOriginsProd : allowedOriginsDev;

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
};

module.exports = corsOptions;