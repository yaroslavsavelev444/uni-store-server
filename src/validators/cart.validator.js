import { body, param } from "express-validator";
import { Types } from "mongoose";

const validateCartItem = [
	body("productId")
		.notEmpty()
		.withMessage("ID продукта обязателен")
		.custom((value) => Types.ObjectId.isValid(value))
		.withMessage("Некорректный формат ID продукта"),

	body("quantity")
		.notEmpty()
		.withMessage("Количество обязательно")
		.isInt({ min: 1 })
		.withMessage("Количество должно быть целым числом не менее 1"),
];

const validateProductId = [
	param("productId")
		.notEmpty()
		.withMessage("ID продукта обязателен")
		.custom((value) => Types.ObjectId.isValid(value))
		.withMessage("Некорректный формат ID продукта"),
];

export default {
	validateCartItem,
	validateProductId,
};
