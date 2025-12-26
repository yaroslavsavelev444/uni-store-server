const { body, param } = require("express-validator");

const wishlistValidators = {
  addOrRemoveProduct: [
    body("productId")
      .notEmpty()
      .withMessage("ID товара обязателен")
      .isMongoId()
      .withMessage("Некорректный формат ID товара"),
    body("notes")
      .optional()
      .isString()
      .withMessage("Заметки должны быть строкой")
      .isLength({ max: 500 })
      .withMessage("Заметки не могут превышать 500 символов")
  ],
  
  updateSettings: [
    body("notifyOnPriceDrop")
      .optional()
      .isBoolean()
      .withMessage("Уведомление о скидке должно быть булевым значением"),
    body("notifyOnRestock")
      .optional()
      .isBoolean()
      .withMessage("Уведомление о поступлении должно быть булевым значением"),
    body("sortBy")
      .optional()
      .isIn(["addedAt", "priceAsc", "priceDesc", "popularity", "name"])
      .withMessage("Некорректное значение сортировки")
  ],
  
  moveToCart: [
    body("productId")
      .notEmpty()
      .withMessage("ID товара обязателен")
      .isMongoId()
      .withMessage("Некорректный формат ID товара"),
    body("quantity")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Количество должно быть целым числом не менее 1")
  ]
};

module.exports = wishlistValidators;