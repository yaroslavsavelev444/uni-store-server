const notificationTypes = require("../constants/notificationTypes");

function validateNotification(type, data) {
  const config = notificationTypes[type];

  if (!config) {
    return {
      valid: false,
      error: `Unknown notification type: ${type}`,
      missing: []
    };
  }

  const missing = [];

  for (const key of config.required) {
    if (data[key] === undefined) missing.push(key);
  }

  return {
    valid: missing.length === 0,
    missing
  };
}


module.exports = { validateNotification };