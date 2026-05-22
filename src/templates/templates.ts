const system_error = (message: any) => ({
  title: "Ошибка в системе",
  body: message,
  data: {},
  options: { type: "system" },
});

const login_from_new_device = (
  user: any,
  deviceInfo: { deviceName: any; ip: any; os: any; location: any },
) => ({
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

export default {
  system_error,
  login_from_new_device,
};
