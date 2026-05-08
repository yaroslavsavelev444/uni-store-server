import { ProductModel, UserSearchModel } from "../models/index.models.js";
import _default from "../models/product-model.js";

const { ProductStatus } = _default;

class SearchService {
	/**
	 * Сохранить или обновить запись в истории поиска
	 * @param {string} userId
	 * @param {string} productId
	 * @returns {Promise<Object>} сохранённый документ
	 */
	async saveSearchHistory(userId, productId) {
		if (!userId) throw new Error("userId is required");
		if (!productId) throw new Error("productId is required");

		try {
			const record = await UserSearchModel.findOneAndUpdate(
				{ userId, selectedProductId: productId },
				{ $currentDate: { updatedAt: true } },
				{ upsert: true, new: true, setDefaultsOnInsert: true },
			);
			return record;
		} catch (err) {
			console.error("[saveSearchHistory] error:", err);
			throw err;
		}
	}

	/**
	 * Получить историю поиска пользователя (последние 15, сортировка по updatedAt DESC)
	 * @param {string} userId
	 * @returns {Promise<Array>} массив записей с populated полем selectedProductId
	 */
	async getSearchHistory(userId) {
		const history = await UserSearchModel.find({ userId })
			.populate("selectedProductId", "title sku")
			.sort({ updatedAt: -1 })
			.limit(15);
		return history;
	}

	/**
	 * Очистить всю историю поиска пользователя
	 * @param {string} userId
	 * @returns {Promise<Object>} результат deleteMany
	 */
	async clearSearchHistory(userId) {
		return await UserSearchModel.deleteMany({ userId });
	}

	/**
	 * Получение подсказок для поиска (hints)
	 * @param {string} query – введённые пользователем символы (минимум 2)
	 * @returns {Promise<Array>} массив отформатированных подсказок
	 */
	async getHints(query) {
		// Если запрос слишком короткий – возвращаем пустой массив
		if (!query || query.length < 2) {
			return [];
		}

		// Экранирование спецсимволов для RegExp
		const escapeRegex = (string) => {
			return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		};

		const sanitizedQuery = query.trim();
		const escapedQuery = escapeRegex(sanitizedQuery);
		const isPossibleSku = /^[a-zA-Z0-9_-]+$/.test(sanitizedQuery);

		let results = [];

		try {
			// Приоритетный поиск по SKU (точное совпадение или начало)
			if (isPossibleSku) {
				results = await ProductModel.find({
					$or: [{ sku: sanitizedQuery }, { sku: new RegExp(`^${escapedQuery}`, "i") }],
					status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
					isVisible: true,
				})
					.select("title sku mainImage priceForIndividual discount status category")
					.populate("category", "name slug")
					.limit(10);
			}

			// Если по SKU ничего не найдено или SKU-поиск не применялся – полнотекстовый поиск
			if (!results || results.length === 0) {
				results = await ProductModel.find(
					{
						$text: { $search: sanitizedQuery },
						status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
						isVisible: true,
					},
					{ score: { $meta: "textScore" } },
				)
					.sort({ score: { $meta: "textScore" }, title: 1 })
					.select("title sku mainImage priceForIndividual discount status category")
					.populate("category", "name slug")
					.limit(10);
			}

			// Если полнотекстовый поиск не дал результатов – fallback через regex по разным полям
			if (!results || results.length === 0) {
				results = await ProductModel.find({
					$or: [
						{ title: new RegExp(escapedQuery, "i") },
						{ description: new RegExp(escapedQuery, "i") },
						{ manufacturer: new RegExp(escapedQuery, "i") },
						{ keywords: new RegExp(escapedQuery, "i") },
					],
					status: { $in: [ProductStatus.AVAILABLE, ProductStatus.PREORDER] },
					isVisible: true,
				})
					.select("title sku mainImage priceForIndividual discount status category")
					.populate("category", "name slug")
					.limit(10);
			}

			// Форматируем результаты для фронтенда
			const formattedResults = results.map((product) => {
				let finalPrice = product.priceForIndividual;
				if (product.discount?.isActive) {
					const now = new Date();
					const validFrom = product.discount.validFrom || new Date(0);
					const validUntil = product.discount.validUntil || new Date("9999-12-31");

					if (now >= validFrom && now <= validUntil) {
						if (product.discount.percentage > 0) {
							finalPrice = finalPrice * (1 - product.discount.percentage / 100);
						}
						if (product.discount.amount > 0) {
							finalPrice = Math.max(0, finalPrice - product.discount.amount);
						}
						finalPrice = Math.round(finalPrice * 100) / 100;
					}
				}

				const isPreorder = product.status === ProductStatus.PREORDER;

				return {
					value: product._id.toString(),
					label: product.title,
					sku: product.sku,
					price: finalPrice,
					originalPrice: product.discount?.isActive ? product.priceForIndividual : null,
					hasDiscount: product.discount?.isActive || false,
					image: product.mainImage,
					category: product.category?.name || null,
					isPreorder,
					raw: product.toObject(),
				};
			});

			console.log(`[SearchService] getHints: query="${query}" results=${formattedResults.length}`);
			return formattedResults;
		} catch (err) {
			console.error(`[SearchService] getHints error: ${err.message}`);
			throw err;
		}
	}

	/**
	 * Заглушка метода расчёта цены (реализация в вашем ProductService)
	 * @param {Object} product
	 * @returns {number}
	 */
	calculateFinalPrice(product) {
		// Здесь должна быть реальная логика расчёта цены для индивидуального клиента
		return product.priceForIndividual || 0;
	}
}

export default new SearchService();
