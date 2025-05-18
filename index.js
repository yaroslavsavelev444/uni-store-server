const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./src/routes/authRoutes');
const errorHandler = require('./src/middleware/error');
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

require('./src/queues/workers/processors');

connectDB();

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

const uploadsPath = path.resolve(process.cwd(), 'src', 'uploads'); 
app.use('/uploads', express.static(uploadsPath));
app.use('/auth', authRoutes);
app.use('/products', productsRoutes);
app.use('/contacts', contactsRoutes);
app.use('/org', orgRoutes);
app.use('/categories', categoriesRoutes);
app.use('/reviews', reviewsRoutes);
app.use('/orders', authMiddleware, ordersRoutes);
app.use('/cart', authMiddleware, cartRoutes);
app.use('/admin', authMiddleware , adminMiddleware, adminRoutes);
app.use('/queues', bullBoardRouter);
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend доступен' });
});
app.use(errorHandler);

const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const port = process.env.PORT || 3000;

app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});