function formatOrderAsTelegramMessage(orderData = {}) {
  let message = `<b>📦 Новый заказ оформлен</b>\n\n`;

  message += `<b>Пользователь:</b> ${orderData.user || "Неизвестно"}\n\n`;

  message += `<b>📍 Доставка:</b>\n`;
  message += `Метод: ${orderData.deliveryMethod || "Не указан"}\n`;
  message += `ТК: ${orderData.deliveryData?.tk || "Не указана"}\n`;
  message += `Адрес: ${orderData.deliveryData?.address || "Не указан"}\n`;
  if (orderData.deliveryData?.comment) {
    message += `Комментарий: ${orderData.deliveryData.comment}\n`;
  }

  message += `\n<b>👤 Получатель:</b>\n`;
  message += `ФИО: ${orderData.recipientData?.name || "Не указано"}\n`;
  message += `Телефон: ${orderData.recipientData?.phone || "Не указан"}\n`;
  message += `Email: ${orderData.recipientData?.email || "Не указан"}\n`;

  if (orderData.isCompany) {
    message += `\n<b>🏢 Компания:</b>\n`;
    message += `Название: ${orderData.companyData?.company?.name || "Не указано"}\n`;
    message += `ИНН: ${orderData.companyData?.company?.inn || "Не указан"}\n`;
  }

  message += `\n<b>🛒 Состав заказа:</b>\n`;
  if (Array.isArray(orderData.products) && orderData.products.length > 0) {
    orderData.products.forEach((item) => {
      const product = item.product || "Товар";
      const quantity = item.quantity ?? "?";
      const totalPrice = item.totalPriceWithDiscount ?? "?";
      message += `- ${product} × ${quantity} = ${totalPrice} ₽\n`;
    });
  } else {
    message += "Нет товаров в заказе\n";
  }

  message += `\n<b>💰 Итого:</b>\n`;
  const total = orderData.priceDetails?.totalPrice;
  const totalWithDiscount = orderData.priceDetails?.totalPriceWithDiscount;

  message += `Без скидки: ${typeof total === "number" ? total + " ₽" : "Не указано"}\n`;
  message += `<b>К оплате: ${typeof totalWithDiscount === "number" ? totalWithDiscount + " ₽" : "Не указано"}</b>\n`;

  return message;
}

export default { formatOrderAsTelegramMessage };
