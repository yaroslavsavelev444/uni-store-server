const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./src/routes/authRoutes');
const errorHandler = require('./src/middleware/error');
const { host, port } = require('./src/utils/serverInfo'); // Получаем из utils
const logger = require('./src/utils/logger');
const authMiddleware = require('./src/middleware/auth-middleware'); 
const productsRoutes = require('./src/routes/productsRoutes');
const contactsRoutes = require('./src/routes/contactsRoutes');
const reviewsRoutes = require('./src/routes/reviewsRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const adminMiddleware = require('./src/middleware/adminMiddleware');
const cartRoutes = require('./src/routes/cartRoutes');
const categoriesRoutes = require('./src/routes/categoriesRoutes');
const orgRoutes = require('./src/routes/orgRoutes');
const ordersRoutes = require('./src/routes/ordersRoutes');
require('dotenv').config();
const bullBoardRouter = require('./src/queues/bullBoard');
const app = express();
const server = http.createServer(app);
const {connectDB} = require('./src/config/mongo');
const path = require("path");

// Подключение к базе данных
connectDB();

// Настройка миддлваров
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`Запрос: ${req.method} ${req.url}`);
  next();
});

// Подключить абсолютный путь к папке uploads
const uploadsPath = path.resolve(process.cwd(), 'src', 'uploads'); // абсолютный путь
app.use('/uploads', express.static(uploadsPath));
// Подключение маршрутов
app.use('/auth', authRoutes);
app.use('/products',authMiddleware, productsRoutes);
app.use('/contacts',authMiddleware, contactsRoutes);
app.use('/org', orgRoutes);
app.use('/categories', categoriesRoutes);
app.use('/reviews', authMiddleware, reviewsRoutes);
app.use('/orders', authMiddleware, ordersRoutes);
app.use('/cart', authMiddleware, cartRoutes);
app.use('/admin',authMiddleware, adminMiddleware, adminRoutes);
app.use('/admin/queues', bullBoardRouter);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const HOST = 'localhost'; // <-- ВАЖНО

app.listen(PORT, HOST, () => {
  console.log(`🚀 Сервер запущен на http://${HOST}:${PORT}`);
});