const mongoose = require('mongoose');

// URI подключения
const uri = 'mongodb://localhost:27017/uni-store'; // Локальный сервер

// Подключение к базе данных
const connectDB = async () => {
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
        });

        console.log('✅ Подключено к MongoDB через Mongoose');

        // Ждём, пока соединение откроется
        mongoose.connection.once('open', async () => {
            try {
                const collections = await mongoose.connection.db.listCollections().toArray();
                console.log('📂 Коллекции в базе данных:');
                collections.forEach((collection) => console.log(`- ${collection.name}`));
            } catch (err) {
                console.error('⚠️ Ошибка при получении коллекций:', err);
            }
        });

    } catch (err) {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        throw err;
    }
};

// Получение экземпляра базы данных через Mongoose
const getDB = () => {
    if (!mongoose.connection.readyState) {
        throw new Error('❌ База данных не инициализирована. Вызовите connectDB() сначала.');
    }
    return mongoose.connection;
};

// Запускаем подключение при старте сервера
connectDB();

module.exports = { connectDB, getDB };