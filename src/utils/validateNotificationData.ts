import { notificationTypes } from "../constants/notificationTypes.js";

// Выводим тип допустимых ключей
type NotificationType = keyof typeof notificationTypes;

function validateNotification(
  type: NotificationType,
  data: Record<string, unknown>,
) {
  const config = notificationTypes[type]; // теперь ошибки нет

  if (!config) {
    return {
      valid: false,
      error: `Unknown notification type: ${type}`,
      missing: [],
    };
  }

  const missing: string[] = [];

  for (const key of config.required) {
    if (data[key] === undefined) missing.push(key);
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

export default { validateNotification };
