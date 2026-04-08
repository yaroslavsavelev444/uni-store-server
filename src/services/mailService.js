const nodemailer = require("nodemailer");
const renderTemplate = require("../emailTemplates/renderer");
const { formattedDate } = require("../utils/formats");
const ApiError = require("../exceptions/api-error");
require("dotenv").config();

// Транспортер
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_USER_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    debug: true,
  });
};

// Универсальная отправка письма
const sendMail = async ({ to, subject, text, html }) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"ООО НПО "Полет" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Письмо отправлено на ${to}`);
  } catch (error) {
    console.error(`❌ Ошибка отправки письма на ${to}:`, error);
    throw new Error("Ошибка отправки письма");
  }
};

// Обработка различных типов писем
const sendNotification = async ({ email, type, data }) => {
  let subject = "";
  let text = "";
  let html = "";

  switch (type) {
    case "resetPassword": {
      subject = "Сброс пароля";
      text = `Привет, ${data.username}! Для сброса пароля перейдите по следующей ссылке: ${data.resetLink}`;
      html = renderTemplate("resetPassword", {
        resetLink: data.resetLink,
        companyName: "ООО НПО Полет",
      });
      break;
    }

    case "newOrderUser": {
      subject = `Заказ №${order.orderNumber} создан`;
      text = `Заказ №${order.orderNumber} создан.

Сумма: ${order.pricing.total} ${order.pricing.currency}

Детали заказа доступны в личном кабинете.

ООО НПО Полет`;

      html = renderTemplate("newOrderUser", {
        ...data,
      });
      break;
    }

    case "orderAwaitingPayment":{
      subject = `Ожидание оплаты для заказа No${data.orderNumber}`;
      text = `Ваш заказ No${data.orderNumber} ожидает оплаты.
Итоговая сумма: ${data.orderData.pricing.total} ${data.orderData.pricing.currency}`; //yookassa

      html = renderTemplate("orderAwaitingPayment", {
        ...data,
      });
      break;
    }

    case "newOrderAdmin": {
  subject = `Новый заказ №${data.orderNumber}`;

  text = `Новый заказ.

Номер: ${data.orderNumber}
Клиент: ${data.customer.name}
Email: ${data.customer.email}
Телефон: ${data.customer.phone}
Сумма: ${data.orderData.pricing.total} ${data.orderData.pricing.currency}

Ссылка: https://yourdomain.com/admin/orders/${data.orderData._id}

ООО НПО ПОЛЕТ`;

  html = renderTemplate("newOrderAdmin", {
    ...data,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}
    case "twofaCode": {
  subject = "Код подтверждения входа";

  text = `Код подтверждения: ${data.code}

Срок действия: ${data.expiresInMinutes} мин.

Если вы не выполняли вход, не используйте код.

ООО НПО ПОЛЕТ`;

  html = renderTemplate("twofaCode", {
    code: data.code,
    expiresInMinutes: data.expiresInMinutes,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}


    case "orderCancelledByAdmin": {
  subject = `Заказ №${data.orderNumber} отменен`;

  text = `Заказ №${data.orderNumber} отменен.

Причина: ${data.reason}
Дата отмены: ${data.orderData.cancellation.cancelledAt}

ООО НПО ПОЛЕТ`;

  html = renderTemplate("orderCancelledByAdmin", {
    ...data,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}
    case "newProductReview": {
  subject = `Новый отзыв на товар`;

  text = `Новый отзыв на товар: ${data.productTitle}

Пользователь: ${data.userName}
Оценка: ${data.rating}/5
Комментарий: ${data.comment}
${data.pros ? `Достоинства: ${data.pros.join(", ")}\n` : ""}${data.cons ? `Недостатки: ${data.cons.join(", ")}\n` : ""}
Ссылка: https://yourdomain.com/admin/reviews/${data.reviewId}

ООО НПО ПОЛЕТ`;

  html = renderTemplate("newProductReview", {
    ...data,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}

    case "orderShipped": {
  subject = `Заказ №${data.orderNumber} отправлен`;

  text = `Заказ №${data.orderNumber} передан в доставку.

Трек-номер: ${data.trackingNumber}
Служба доставки: ${data.carrier}
Ожидаемая дата доставки: ${data.estimatedDelivery}

ООО НПО ПОЛЕТ`;

  html = renderTemplate("orderShipped", {
    ...data,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}

   case "orderReadyForPickup": {
  subject = `Заказ №${data.orderNumber} готов к выдаче`;

  text = `Заказ №${data.orderNumber} готов к выдаче.

Пункт выдачи: ${data.pickupPoint.name}
Адрес: ${data.pickupPoint.address}
Часы работы: ${data.pickupPoint.hours}

ООО НПО ПОЛЕТ`;

  html = renderTemplate("orderReadyForPickup", {
    ...data,
    companyName: "ООО НПО ПОЛЕТ",
  });

  break;
}

   case "newAttachment": {
  subject = `Новый файл в заказе №${data.orderNumber}`;

  text = `В заказ №${data.orderNumber} добавлен новый файл.

Название: ${data.attachment.name}
Размер: ${data.attachment.size} байт
Тип: ${data.attachment.mimeType}
Дата загрузки: ${data.attachment.uploadedAt}`;

  html = renderTemplate("newAttachment", {
    orderNumber: data.orderNumber,
    attachment: {
      name: data.attachment.name,
      size: data.attachment.size,
      mimeType: data.attachment.mimeType,
      uploadedAt: data.attachment.uploadedAt,
    },
  });

  break;
}

    case "newLogin": {
  subject = "Новый вход в аккаунт";

  text = `В аккаунт выполнен вход с нового устройства.

IP-адрес: ${data.ip}
Устройство: ${data.deviceType} ${data.deviceModel}
Операционная система: ${data.os} ${data.osVersion}
Дата и время: ${data.date}

Если это были не вы, немедленно смените пароль и проверьте активные сессии.`;

  html = renderTemplate("newLogin", {
    ip: data.ip,
    deviceType: data.deviceType,
    deviceModel: data.deviceModel,
    os: data.os,
    osVersion: data.osVersion,
    date: formattedDate(data.date),
  });

  break;
}

    case "consentUpdated": {
  subject = `Обновлены условия: ${data.consentTitle}`;

  text = `Обновлены условия: ${data.consentTitle} (версия ${data.version} от ${data.updateDate}).

Изменения:
${data.changeDescription}

Новая версия документа: ${data.documentUrl || "доступна на сайте"}

Дата вступления в силу: ${data.effectiveDate}

Продолжение использования сервиса после указанной даты означает согласие с обновленными условиями.

Если вы не согласны с изменениями, вы можете прекратить использование сервиса и удалить аккаунт в настройках.`;

  html = renderTemplate("consentUpdated", {
    consentTitle: data.consentTitle,
    version: data.version,
    updateDate: data.updateDate,
    changeDescription: data.changeDescription,
    documentUrl: data.documentUrl,
    effectiveDate: data.effectiveDate,
  });

  break;
}


    case "newFeedback": {
  subject = "Новый фидбек";

  text = `Новый фидбек.

ID: ${data.feedbackId}
Название: ${data.title}
Тип: ${data.type}
Пользователь: ${data.userName} (${data.userEmail})
Приоритет: ${data.priority}
Дата: ${formattedDate(data.createdAt)}

Описание:
${data.description}`;

  html = renderTemplate("newFeedback", {
    feedbackId: data.feedbackId,
    title: data.title,
    type: data.type,
    userName: data.userName,
    userEmail: data.userEmail,
    priority: data.priority,
    createdAt: formattedDate(data.createdAt),
    description: data.description,
  });

  break;
}

    case "feedbackStatusChanged": {
  subject = "Обновлён статус фидбека";

  text = `Статус фидбека "${data.title}" изменён.

ID: ${data.feedbackId}
Старый статус: ${data.oldStatus}
Новый статус: ${data.newStatus}
Дата обновления: ${formattedDate(data.updatedAt)}`;

  html = renderTemplate("feedbackStatusChanged", {
    feedbackId: data.feedbackId,
    title: data.title,
    oldStatus: data.oldStatus,
    newStatus: data.newStatus,
    userName: data.userName,
    updatedAt: formattedDate(data.updatedAt),
  });

  break;
}

    case "feedbackAssigned": {
  subject = "Назначен новый фидбек";

  text = `Вам назначен фидбек: "${data.title}"

Тип: ${data.type}
Приоритет: ${data.priority}
Описание: ${data.description}
Дата создания: ${formattedDate(data.createdAt)}

Перейти к фидбеку: https://yourdomain.com/user/feedback/${data.feedbackId}`;

  html = renderTemplate("feedbackAssigned", {
    feedbackId: data.feedbackId,
    title: data.title,
    type: data.type,
    priority: data.priority,
    description: data.description,
    createdAt: formattedDate(data.createdAt),
    userName: data.userName,
    assignedBy: data.assignedBy,
  });

  break;
}

    case "orderCancelledByUser": {
  subject = "Заказ отменен";

  text = `Заказ №${data.orderData.orderNumber} отменен.

Статус: отменен пользователем
Причина: ${data.orderData.cancellation?.reason || "не указана"}
Отменившая сторона: ${data.orderData.cancellation?.cancelledBy || "не указано"}
Дата отмены: ${formattedDate(data.orderData.cancellation?.cancelledAt)}
Сумма заказа: ${data.orderData.pricing.total} ${data.orderData.pricing.currency}

Заказ: https://yourdomain.com/orders/${data.orderData._id}`;

  html = renderTemplate("orderCancelledByUser", {
    orderNumber: data.orderData.orderNumber,
    cancellation: data.orderData.cancellation,
    pricing: data.orderData.pricing,
    _id: data.orderData._id,
  });

  break;
}

    case "resetPasswordCompleted": {
  subject = "Пароль учетной записи изменен";

  text = `Пароль учетной записи ${data.email} был изменен.

Если это действие совершили не вы, выполните немедленную смену пароля и проверьте безопасность аккаунта.`;

  html = renderTemplate("resetPasswordCompleted", {
    name: data.name,
    email: data.email,
  });

  break;
}


    default:
      throw ApiError.BadRequest("Неверный тип уведомления");
  }

  console.log("html", html);

  await sendMail({
    to: email,
    subject,
    text,
    html,
  });

  console.log(`Уведомление "${type}" отправлено на ${email}`);
};

module.exports = {
  sendNotification,
};
