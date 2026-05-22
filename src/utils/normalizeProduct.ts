import { Types } from "mongoose";

/**
 * Проверяет, является ли значение ObjectId (Mongoose или драйвер)
 */
function isObjectId(value: any): boolean {
  return value instanceof Types.ObjectId || value?._bsontype === "ObjectId";
}

/**
 * Рекурсивно нормализует документ: ObjectId → string, $oid → string, $date → ISO string, и т.д.
 */
function normalizeDocument<T>(doc: T): T {
  if (doc === null || doc === undefined) return doc;

  // 1. ObjectId (Mongoose)
  if (isObjectId(doc)) {
    return doc.toString() as T;
  }

  // 2. Специальные объекты MongoDB: { "$oid": "..." } или { "$date": "..." }
  if (typeof doc === "object" && !Array.isArray(doc)) {
    const obj = doc as Record<string, any>;
    if (obj.$oid) {
      return obj.$oid as T;
    }
    if (obj.$date) {
      return new Date(obj.$date).toISOString() as T;
    }
  }

  // 3. Массивы – обрабатываем каждый элемент
  if (Array.isArray(doc)) {
    return doc.map((item) => normalizeDocument(item)) as T;
  }

  // 4. Обычные объекты (не массив, не специальный) – рекурсивно по ключам
  if (typeof doc === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(doc)) {
      // Пропускаем внутренние поля MongoDB, которые уже обработаны отдельно
      if (key === "$oid" || key === "$date") continue;
      result[key] = normalizeDocument(value);
    }
    return result as T;
  }

  // 5. Примитивы и всё остальное
  return doc;
}

/**
 * Основной нормализатор продукта.
 * Дополнительно приводит поле specifications[].value к строке (если есть).
 * Можно расширить под нужды фронтенда.
 */
export function normalizeProduct(product: any): any {
  if (!product || typeof product !== "object") return product;

  // Сначала общая нормализация всех ObjectId и $date
  const normalized = normalizeDocument(product);

  // Специфичные для продукта доработки:
  if (normalized.specifications && Array.isArray(normalized.specifications)) {
    normalized.specifications = normalized.specifications.map((spec: any) => {
      // Приводим value к строке (иначе на клиенте проблемы)
      const val = spec.value;
      const stringValue = val !== undefined && val !== null ? String(val) : "";
      return {
        ...spec,
        value: stringValue,
        // Убедимся, что _id стал строкой (normalizeDocument уже сделал, но на всякий)
        _id: spec._id ? String(spec._id) : undefined,
      };
    });
  }

  // Если category – объект, нормализуем его _id
  if (normalized.category && typeof normalized.category === "object") {
    normalized.category = {
      ...normalized.category,
      _id: normalized.category._id
        ? String(normalized.category._id)
        : undefined,
    };
  }

  // Обязательно приводим корневой _id к строке
  if (normalized._id) {
    normalized._id = String(normalized._id);
  }

  // Можно добавить преобразование createdBy, updatedBy и т.д. – они уже будут строками после normalizeDocument
  return normalized;
}
