const { YooCheckout } = require('../services/yooService'); 

const YOO_TEST_SHOP_ID = process.env.YOO_TEST_SHOP_ID;
const YOO_TEST_SECRET_KEY = process.env.YOO_TEST_SECRET_KEY;

module.exports = new YooCheckout({
  shopId: YOO_TEST_SHOP_ID,
  secretKey: YOO_TEST_SECRET_KEY,
  debug: process.env.NODE_ENV === 'development'
});