const subscription_match = (listing, sub, business) => ({
  title: "Новый бизнес по вашей подписке",
  body: `Совпадение в секторе ${sub?.sector?.label || "—"}: ${
    listing?.title || "Без названия"
  } (${listing?.addressId?.city || "город не указан"})`,
  data: {
    listingId: listing._id,
    subscriptionId: sub._id,
    sector: sub?.sector?.label || null,
    price: listing?.price || null,
    address: listing?.addressId?.fullAddress || null,
  },
  options: {
    type: "subscription_match",
    link: `/business/${business?._id}`,
    priority: "high",
  },
});

const moderation_passed = (listing) => ({
  title: "Ваш бизнес прошёл модерацию",
  body: `Объявление "${listing.title}" теперь опубликовано.`,
  data: {
    listingId: listing._id,
  },
  options: {
    type: "moderation_passed",
    link: `/business/${listing._id}`,
    priority: "normal",
  },
});

const system_error = (message) => ({
  title: "Ошибка в системе",
  body: message,
  data: {},
  options: { type: "system" },
});

const login_from_new_device = (user, deviceInfo) => ({
  title: "Новый вход в аккаунт",
  body: `Ваш аккаунт был использован для входа с нового устройства ${
    deviceInfo?.deviceName || "неизвестного"
  } (${deviceInfo?.ip || "IP не указан"}). 
Если это были не вы — смените пароль.`,
  data: {
    ip: deviceInfo?.ip || null,
    deviceName: deviceInfo?.deviceName || null,
    os: deviceInfo?.os || null,
    location: deviceInfo?.location || null,
    timestamp: Date.now(),
  },
  options: {
    type: "login_from_new_device",
    link: `/profile/security`, 
    priority: "high",
  },
});

// Именованный экспорт в CommonJS
module.exports = {
  subscription_match,
  moderation_passed,
  system_error,
  login_from_new_device
};