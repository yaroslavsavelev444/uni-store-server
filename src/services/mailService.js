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
    from: `"КПБ "Полет" <${process.env.SMTP_USER}>`,
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
    case "confirmEmail": {
      subject = "Подтверждение вашей почты";
      text = `Привет, ${data.username}! Пожалуйста, подтвердите вашу почту: ${data.confirmationLink}`;
      html = renderTemplate("confirmEmail", {
        username: data.username,
        confirmationLink: data.confirmationLink,
        companyName: "КПБ Полет",
      });
      break;
    }
    case "resetPassword": {
      subject = "Сброс пароля";
      text = `Привет, ${data.username}! Для сброса пароля перейдите по следующей ссылке: ${data.resetLink}`;
      html = renderTemplate("resetPassword", {
        resetLink: data.resetLink,
        companyName: "КПБ Полет",
      });
      break;
    }

    case "newOrderUser": {
      subject = `📝 Ваш заказ No${data.orderNumber}`;
      text = `Ваш заказ был создан.
Номер заказа: ${data.orderNumber}
Имя: ${data.customer.name}
Email: ${data.customer.email}
Телефон: ${data.customer.phone}
Итоговая сумма: ${data.orderData.pricing.total} ${data.orderData.pricing.currency}
Ссылка на заказ: https://yourdomain.com/orders/${data.orderData._id}`;

      html = renderTemplate("newOrderUser", {
        ...data,
      });
      break;
    }

    case "newOrderAdmin": {
      subject = `📝 Новый заказ от клиента No${data.orderNumber}`;
      text = `Поступил новый заказ.
Номер заказа: ${data.orderNumber}
Имя клиента: ${data.customer.name}
Email: ${data.customer.email}
Телефон: ${data.customer.phone}
Итоговая сумма: ${data.orderData.pricing.total} ${data.orderData.pricing.currency}
Ссылка на заказ: https://yourdomain.com/admin/orders/${data.orderData._id}`;

      html = renderTemplate("newOrderAdmin", {
        ...data,
      });
      break;
    }
    case "twofaCode": {
      subject = "🔑 Ваш код 2FA";
      text = `Ваш код подтверждения: ${data.code} (действителен ${data.expiresInMinutes} минут)`;
      html = renderTemplate("twofaCode", {
        code: data.code,
        expiresInMinutes: data.expiresInMinutes,
        year: new Date().getFullYear(),
      });
      break;
    }

    case "orderCancelledByUser": {
      subject = "📝 Заказ отменен";
      html = renderTemplate("orderCancelledByUser", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
      });
      break;
    }

    case "orderPickupReady": {
      //TODO
      subject = "📝 Заказ готов к выдаче";
      html = renderTemplate("orderPickupReady", {
        ...data,
        formattedDate: formattedDate(data.createdAt), // TODO инвалид дата и сырые значения кое где
      });
      break;
    }

    case "orderDeliverySent": {
      subject = "📝 Заказ отправлен";
      html = renderTemplate("orderDeliverySent", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
      });
      break;
    }

    case "orderCancelledByAdmin": {
      subject = `❌ Ваш заказ No${data.orderNumber} отменен`;
      text = `Ваш заказ No${data.orderNumber} был отменен.
Причина: ${data.reason}
${
  data.refundAmount
    ? `Сумма возврата: ${data.refundAmount} ${data.orderData.pricing.currency}`
    : ""
}
Дата отмены: ${data.orderData.cancellation.cancelledAt}

Ссылка на заказ: https://yourdomain.com/orders/${data.orderNumber}`;

      html = renderTemplate("orderCancelledByAdmin", {
        ...data,
      });
      break;
    }
    case "newProductReview": {
      subject = `📝 Новый отзыв на товар: ${data.productTitle}`;
      text = `Пользователь оставил новый отзыв на товар: ${data.productTitle}
Имя пользователя: ${data.userName}
Оценка: ${data.rating} / 5
Комментарий: ${data.comment}
${data.pros ? `Достоинства: ${data.pros.join(", ")}` : ""}
${data.cons ? `Недостатки: ${data.cons.join(", ")}` : ""}

Ссылка для модерации: https://yourdomain.com/admin/reviews/${data.reviewId}`;

      html = renderTemplate("newProductReview", { ...data });
      break;
    }

    case "orderShipped": {
      subject = `🚚 Ваш заказ No${data.orderNumber} отправлен`;
      text = `Ваш заказ No${data.orderNumber} уже в пути.
Трек-номер: ${data.trackingNumber}
Служба доставки: ${data.carrier}
Ожидаемая дата доставки: ${data.estimatedDelivery}

Ссылка на заказ: https://yourdomain.com/orders/${data.orderNumber}`;

      html = renderTemplate("orderShipped", {
        ...data,
      });
      break;
    }

    case "orderReadyForPickup": {
      subject = `🏬 Ваш заказ No${data.orderNumber} готов к выдаче`;
      text = `Ваш заказ No${data.orderNumber} ожидает вас в пункте выдачи.
Пункт выдачи: ${data.pickupPoint.name}, ${data.pickupPoint.address}
Часы работы: ${data.pickupPoint.hours}

Ссылка на заказ: https://yourdomain.com/orders/${data.orderNumber}`;

      html = renderTemplate("orderReadyForPickup", {
        ...data,
      });
      break;
    }

    case "newAttachment": {
      subject = `📎 Новый файл в заказе No${data.orderNumber}`;
      text = `Менеджер прикрепил новый файл к вашему заказу No${data.orderNumber}.
Название файла: ${data.attachment.name}
Размер: ${data.attachment.size} байт
Тип файла: ${data.attachment.mimeType}
Дата загрузки: ${data.attachment.uploadedAt}

Ссылка на заказ: https://yourdomain.com/orders/${data.orderNumber}`;

      html = renderTemplate("newAttachment", {
        ...data,
      });
      break;
    }

    case "productArchived": {
      //TODO
      subject = "📝 Продукт архивирован";
      html = renderTemplate("productArchived", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
      });
      break;
    }

    case "orderFileUploaded": {
      subject = "📝 Прикрепили к заказу файл";
      html = renderTemplate("orderFileUploaded", {
        ...data,
        formattedDate: formattedDate(data.updatedAt),
      });
      break;
    }

    case "newLogin": {
      subject = "🔔 Новый вход в аккаунт";
      text = `В ваш аккаунт был выполнен вход с нового устройства.
IP: ${data.ip}
Устройство: ${data.deviceType} ${data.deviceModel}
ОС: ${data.os} ${data.osVersion}
Дата: ${data.date}

Если это были не вы, смените пароль.`;

      html = renderTemplate("newLogin", {
        ip: data.ip,
        deviceType: data.deviceType,
        deviceModel: data.deviceModel,
        os: data.os,
        osVersion: data.osVersion,
        date: formattedDate(data.date), // дата уже форматированная
      });
      break;
    }
    case "newFeedback": {
      subject = "📬 Новый фидбек от пользователя";
      text = `Поступил новый фидбек:
Название: ${data.title}
Тип: ${data.type}
Пользователь: ${data.userName} (${data.userEmail})
Приоритет: ${data.priority}
Дата: ${formattedDate(data.createdAt)}
Описание: ${data.description}`;

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
      subject = "📢 Статус вашего фидбека изменён";
      text = `Статус вашего фидбека "${data.title}" изменён:
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
      subject = "📌 Вам назначен фидбек";
      text = `Вам назначен фидбек "${data.title}".
Тип: ${data.type}
Приоритет: ${data.priority}
Краткое описание: ${data.description}
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
      subject = "❌ Заказ отменен пользователем";
      text = `Заказ No${data.orderData.orderNumber} был отменен пользователем.
Причина: ${data.orderData.cancellation.reason}
Отменил пользователь: ${data.orderData.cancellation.cancelledBy}
Дата отмены: ${formattedDate(data.orderData.cancellation.cancelledAt)}
Итоговая сумма: ${data.orderData.pricing.total} ${
        data.orderData.pricing.currency
      }
Ссылка на заказ: https://yourdomain.com/orders/${data.orderData._id}`;

      html = renderTemplate("orderCancelledByUser", {
        ...data.orderData,
        cancellation: data.orderData.cancellation,
        pricing: data.orderData.pricing,
        orderNumber: data.orderData.orderNumber,
        _id: data.orderData._id,
      });
      break;
    }

    case "resetPasswordCompleted": {
      subject = "🔒 Ваш пароль успешно обновлен";
      text = `Ваш пароль был успешно обновлен.
Если это были не вы, срочно смените пароль.`;

      html = renderTemplate("resetPasswordCompleted", {
        name: data.name,
        email: data.email,
      });
      break;
    }

    case "newContact": {
      subject = "📩 Новая заявка на консультацию";
      html = renderTemplate("newContact", {
        ...data.contactData,
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

  console.log(`📨 Уведомление "${type}" отправлено на ${email}`);
};

module.exports = {
  sendNotification,
};
