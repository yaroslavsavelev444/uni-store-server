const crypto = require('crypto');

class Robokassa {
  constructor() {
    this.merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    this.password1 = process.env.ROBOKASSA_PASSWORD1;     
    this.password2 = process.env.ROBOKASSA_PASSWORD2;     
    this.testPassword1 = process.env.ROBOKASSA_TEST_PASSWORD1; 
    this.testPassword2 = process.env.ROBOKASSA_TEST_PASSWORD2;

    if (!this.merchantLogin || !this.password1 || !this.password2) {
      throw new Error('Robokassa: не заданы боевые credentials в .env');
    }
    if (!this.testPassword1 || !this.testPassword2) {
      console.warn('⚠️ Robokassa: тестовые пароли не заданы в .env. Тестовый режим работать не будет.');
    }
  }


  buildPaymentUrl({ invId, outSum, description = '', email = '', isTest = false, culture = 'ru' }) {
    const outSumStr = parseFloat(outSum).toFixed(2);

    // Выбираем нужный Пароль #1
    const pass1 = isTest ? this.testPassword1 : this.password1;

    const signatureString = `${this.merchantLogin}:${outSumStr}:${invId}:${pass1}`;
    const signatureValue = crypto
      .createHash('md5')
      .update(signatureString)
      .digest('hex')
      .toUpperCase();

    const params = new URLSearchParams({
      MerchantLogin: this.merchantLogin,
      OutSum: outSumStr,
      InvId: invId.toString(),
      Description: description.substring(0, 100),
      SignatureValue: signatureValue,
      Culture: culture,
      IsTest: isTest ? '1' : '0',
    });

    if (email) params.append('Email', email);

    return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
  }

  // Проверка подписи для ResultURL (Password#2)
  verifySignature(params) {
    const outSum = params.OutSum;
    const invId = params.InvId;
    const signatureValue = params.SignatureValue;

    // Определяем, тестовый ли режим (Robokassa возвращает IsTest в POST)
    const isTest = params.IsTest === '1' || params.IsTest === 1;

    // Выбираем нужный Пароль #2
    const pass2 = isTest ? this.testPassword2 : this.password2;

    const shpKeys = Object.keys(params)
      .filter(key => key.toLowerCase().startsWith('shp_'))
      .sort((a, b) => a.localeCompare(b));

    const shpStr = shpKeys.map(key => `${key}=${params[key]}`).join(':');

    let base = `${outSum}:${invId}:${pass2}`;
    if (shpStr) base += `:${shpStr}`;

    const calculated = crypto
      .createHash('md5')
      .update(base)
      .digest('hex')
      .toUpperCase();

    const isValid = calculated === (signatureValue || '').toUpperCase();

    if (!isValid) {
      console.warn(`[Robokassa] Неверная подпись. IsTest=${isTest}, InvId=${invId}`);
    }

    return isValid;
  }
}

module.exports = new Robokassa();