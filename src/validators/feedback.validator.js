import { array, boolean, date, number, object, ref, string } from "joi";
import { Types } from "mongoose";
import { escape, sanitize } from "validator";

const objectIdSchema = string().custom((value, helpers) => {
	if (!Types.ObjectId.isValid(value)) {
		return helpers.error("any.invalid");
	}
	return value;
}, "ObjectId validation");

// Sanitization function
const sanitizeInput = (value) => {
	if (typeof value === "string") {
		return escape(sanitize(value.trim()));
	}
	return value;
};

const submitFeedbackSchema = object({
	title: string()
		.required()
		.min(5)
		.max(200)
		.custom(sanitizeInput, "Sanitization")
		.messages({
			"string.empty": "Заголовок обязателен",
			"string.min": "Заголовок должен содержать минимум 5 символов",
			"string.max": "Заголовок не должен превышать 200 символов",
		}),

	description: string()
		.required()
		.min(10)
		.max(5000)
		.custom(sanitizeInput, "Sanitization")
		.messages({
			"string.empty": "Описание обязательно",
			"string.min": "Описание должно содержать минимум 10 символов",
			"string.max": "Описание не должно превышать 5000 символов",
		}),

	type: string()
		.valid("bug", "improvement", "feature", "other")
		.required()
		.messages({
			"any.only": "Тип должен быть одним из: bug, improvement, feature, other",
			"any.required": "Тип обязателен",
		}),

	attachments: array()
		.items(
			object({
				url: string().uri().required(),
				tempName: string().optional(),
				originalName: string().max(255).optional(),
				size: number()
					.max(50 * 1024 * 1024)
					.optional(), // 50MB max
				mimeType: string()
					.pattern(/^[a-z]+\/[a-z0-9\-+]+$/i)
					.optional(),
			}),
		)
		.max(5)
		.optional()
		.messages({
			"array.max": "Максимум 5 вложений",
			"object.base": "Некорректный формат вложения",
			"number.max": "Размер файла не должен превышать 50MB",
		}),
}).custom((value, helpers) => {
	// Дополнительная бизнес-логика валидации
	if (
		value.type === "bug" &&
		!value.description.toLowerCase().includes("ошибка")
	) {
		helpers.message('Для типа "bug" рекомендуется указать детали ошибки');
	}
	return value;
});

const updateStatusSchema = object({
	status: string()
		.valid("new", "in_progress", "resolved", "closed", "duplicate", "wont_fix")
		.required()
		.messages({
			"any.only": "Некорректный статус",
			"any.required": "Статус обязателен",
		}),

	note: string().max(1000).custom(sanitizeInput, "Sanitization").optional(),
});

const prioritySchema = object({
	priority: string()
		.valid("low", "medium", "high", "critical")
		.required()
		.messages({
			"any.only": "Некорректный приоритет",
			"any.required": "Приоритет обязателен",
		}),
});

const addNoteSchema = object({
	note: string()
		.required()
		.min(1)
		.max(1000)
		.custom(sanitizeInput, "Sanitization")
		.messages({
			"string.empty": "Текст заметки обязателен",
			"string.max": "Заметка не должна превышать 1000 символов",
		}),

	isPrivate: boolean().optional().default(false),
});

const tagSchema = object({
	tag: string()
		.required()
		.min(1)
		.max(50)
		.pattern(/^[a-zA-Z0-9а-яА-Я\s\-_]+$/i)
		.custom(sanitizeInput, "Sanitization")
		.messages({
			"string.empty": "Тег обязателен",
			"string.max": "Тег не должен превышать 50 символов",
			"string.pattern.base":
				"Тег может содержать только буквы, цифры, пробелы, дефисы и подчеркивания",
		}),
});

const duplicateSchema = object({
	duplicateOf: objectIdSchema.required().messages({
		"any.required": "ID оригинального фидбека обязателен",
		"any.invalid": "Некорректный формат ID",
	}),

	note: string().max(500).custom(sanitizeInput, "Sanitization").optional(),
});

const idParamSchema = object({
	id: objectIdSchema.required().messages({
		"any.required": "ID обязателен",
		"any.invalid": "Некорректный формат ID",
	}),
});

const paginationSchema = object({
	page: number().integer().min(1).default(1).messages({
		"number.min": "Номер страницы должен быть не меньше 1",
		"number.base": "Номер страницы должен быть числом",
	}),

	limit: number().integer().min(1).max(100).default(50).messages({
		"number.min": "Лимит должен быть не меньше 1",
		"number.max": "Лимит не должен превышать 100",
		"number.base": "Лимит должен быть числом",
	}),

	type: string().valid("bug", "improvement", "feature", "other").optional(),

	status: string()
		.valid("new", "in_progress", "resolved", "closed", "duplicate", "wont_fix")
		.optional(),

	priority: string().valid("low", "medium", "high", "critical").optional(),

	assignedTo: objectIdSchema.optional().messages({
		"any.invalid": "Некорректный формат ID назначенного пользователя",
	}),

	fromDate: date().iso().optional().messages({
		"date.format": "Дата должна быть в формате ISO",
		"date.base": "Некорректный формат даты",
	}),

	toDate: date().iso().min(ref("fromDate")).optional().messages({
		"date.format": "Дата должна быть в формате ISO",
		"date.min": 'Дата "до" должна быть после даты "от"',
		"date.base": "Некорректный формат даты",
	}),

	search: string()
		.max(100)
		.optional()
		.custom(sanitizeInput, "Sanitization")
		.messages({
			"string.max": "Поисковый запрос не должен превышать 100 символов",
		}),

	sortBy: string()
		.valid("createdAt", "updatedAt", "priority", "status", "title")
		.default("createdAt"),

	sortOrder: string().valid("asc", "desc").default("desc"),
});

const exportSchema = object({
	fromDate: date().iso().optional(),

	toDate: date().iso().min(ref("fromDate")).optional(),

	type: string().valid("bug", "improvement", "feature", "other").optional(),

	status: string()
		.valid("new", "in_progress", "resolved", "closed", "duplicate", "wont_fix")
		.optional(),
});

export default {
	submitFeedbackSchema,
	updateStatusSchema,
	prioritySchema,
	addNoteSchema,
	tagSchema,
	duplicateSchema,
	idParamSchema,
	paginationSchema,
	exportSchema,
};
