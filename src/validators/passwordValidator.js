/**
 * Валидация пароля на сервере (должна совпадать с клиентской валидацией)
 * Требования:
 * - Длина: 8-25 символов
 * - Минимум одна заглавная буква (A-Z)
 * - Минимум одна строчная буква (a-z)
 * - Минимум одна цифра (0-9)
 * - Минимум один специальный символ из набора: !@#$%^&*(),.?":{}|<>-
 * @param {string} password - Пароль для проверки
 * @returns {string|null} - Возвращает сообщение об ошибке или null если пароль валиден
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return "Пароль не указан";
  }

  const passwordValidation = {
    length: password.length >= 8 && password.length <= 25,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>-]/.test(password),
  };

  // Проверяем каждое требование
  if (!passwordValidation.length) {
    return "Пароль должен быть от 8 до 25 символов";
  }

  if (!passwordValidation.hasUppercase) {
    return "Пароль должен содержать хотя бы одну заглавную букву (A-Z)";
  }

  if (!passwordValidation.hasLowercase) {
    return "Пароль должен содержать хотя бы одну строчную букву (a-z)";
  }

  if (!passwordValidation.hasDigit) {
    return "Пароль должен содержать хотя бы одну цифру (0-9)";
  }

  if (!passwordValidation.hasSpecialChar) {
    return "Пароль должен содержать хотя бы один специальный символ (!@#$%^&*(),.?\":{}|<>-)";
  }

  // Проверяем, что используются только допустимые символы
  const allowedCharsRegex = /^[a-zA-Z\d!@#$%^&*(),.?":{}|<>-]+$/;
  if (!allowedCharsRegex.test(password)) {
    return "Пароль содержит недопустимые символы. Разрешены только буквы, цифры и специальные символы: !@#$%^&*(),.?\":{}|<>-";
  }

  return null; // Пароль валиден
};

module.exports = { validatePassword };