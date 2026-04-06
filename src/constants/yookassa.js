const { YooCheckout } = require('../services/paymentService'); // путь к вашему классу
const { SHOP_ID, SECRET_KEY, OAUTH_TOKEN } = process.env;

module.exports = new YooCheckout({
  shopId: SHOP_ID,
  secretKey: SECRET_KEY,
  token: OAUTH_TOKEN, // если нужны вебхуки/информация о магазине
  debug: process.env.NODE_ENV === 'development'
});