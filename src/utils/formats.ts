// utils/dateFormatter.ts

/**
 * Опции форматирования даты.
 * Расширяет стандартные Intl.DateTimeFormatOptions,
 * добавляя возможность указать локаль и значение по умолчанию при ошибке.
 */
export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  /**
   * Локаль для форматирования (по умолчанию 'ru-RU')
   */
  locale?: string;
  /**
   * Значение, возвращаемое при некорректной дате (по умолчанию 'Некорректная дата')
   */
  fallbackValue?: string;
}

/**
 * Базовые опции для удобного вызова часто используемых форматов.
 */
export const PRESET_FORMATS = {
  /** Полный формат с датой и временем: "1 января 2023 г., 15:30:45" */
  full: {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  } as const,

  /** Только дата: "1 января 2023 г." */
  dateOnly: {
    year: "numeric",
    month: "long",
    day: "numeric",
  } as const,

  /** Краткая дата: "01.01.2023" */
  shortDate: {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  } as const,

  /** Время: "15:30:45" */
  timeOnly: {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  } as const,

  /** Дата и время в числовом формате: "01.01.2023, 15:30:45" */
  shortDateTime: {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  } as const,
} as const;

/**
 * Умное приведение входного значения к объекту Date.
 * Поддерживает:
 * - Date объекты
 * - числа (timestamp)
 * - строки в форматах, понятных Date.parse()
 * - null, undefined, пустую строку → возвращает null
 *
 * @param input - Входное значение
 * @returns Объект Date или null, если преобразование невозможно
 */
function toDateSafe(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return null;

    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }

    const dateMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const d2 = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(d2.getTime())) {
        return d2;
      }
    }
    return null;
  }

  return null;
}

/**
 * Форматирует дату с учётом локали и опций.
 * Устойчива к некорректным входным данным.
 *
 * @param date - Дата в любом формате (Date, число, строка, null, undefined)
 * @param options - Опции форматирования
 * @returns Отформатированная строка или fallbackValue при ошибке
 *
 * @example
 * formattedDate('2023-01-01T15:30:45Z')
 * // "1 января 2023 г., 18:30:45" (зависит от временной зоны)
 *
 * @example
 * formattedDate(null) // "Некорректная дата"
 *
 * @example
 * formattedDate('invalid', { fallbackValue: '—' }) // "—"
 *
 * @example
 * formattedDate(new Date(), PRESET_FORMATS.dateOnly) // "7 мая 2026 г."
 */
export function formattedDate(
  date: unknown,
  options?: DateFormatOptions | Intl.DateTimeFormatOptions,
): string {
  const isOptionsObject = typeof options === "object" && options !== null;

  const locale = isOptionsObject
    ? ((options as DateFormatOptions).locale ?? "ru-RU")
    : "ru-RU";
  const fallbackValue = isOptionsObject
    ? ((options as DateFormatOptions).fallbackValue ?? "Некорректная дата")
    : "Некорректная дата";

  const formatOptions = isOptionsObject ? { ...options } : {};

  const dateObj = toDateSafe(date);
  if (!dateObj) return fallbackValue;

  try {
    return dateObj.toLocaleString(
      locale,
      formatOptions as Intl.DateTimeFormatOptions,
    );
  } catch (err) {
    console.warn(`[dateFormatter] Ошибка форматирования: ${err}`);
    return fallbackValue;
  }
}

/**
 * Утилита для получения относительного времени (например, "5 минут назад").
 * Опциональная функция, расширяющая возможности.
 *
 * @param date - Исходная дата
 * @param baseDate - Базовая дата для сравнения (по умолчанию сейчас)
 * @param locale - Локаль
 * @returns Строка вида "N минут назад", "только что" и т.п.
 */
export function timeAgo(
  date: unknown,
  baseDate: Date = new Date(),
  locale: string = "ru-RU",
): string {
  const dateObj = toDateSafe(date);
  if (!dateObj) return "Некорректная дата";

  const diffMs = baseDate.getTime() - dateObj.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) {
    // Будущая дата
    return "в будущем";
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffSec < 60) {
    return rtf.format(-diffSec, "second");
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return rtf.format(-diffMin, "minute");
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return rtf.format(-diffHour, "hour");
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return rtf.format(-diffDay, "day");
  }
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) {
    return rtf.format(-diffMonth, "month");
  }
  const diffYear = Math.floor(diffMonth / 12);
  return rtf.format(-diffYear, "year");
}

// Экспорт по умолчанию для обратной совместимости (если нужно)
export default { formattedDate, timeAgo, PRESET_FORMATS };
