import dotenv from "dotenv";
import type { SendMailOptions, Transporter } from "nodemailer";
import { createTransport } from "nodemailer";
import renderTemplate from "../emailTemplates/renderer.js";
import ApiError from "../exceptions/api-error.js";
import type {
  ConsentUpdatedData,
  EmailOrderData,
  EmailType,
  FeedbackAssignedData,
  FeedbackStatusChangedData,
  NewAttachmentData,
  NewFeedbackEmailData,
  NewLoginData,
  NewOrderAdminData,
  NewOrderUserData,
  NewProductReviewData,
  OrderCancelledByAdminData,
  OrderCancelledByUserData,
  OrderReadyForPickupData,
  OrderShippedData,
  ResetPasswordCompletedData,
  ResetPasswordData,
  TwofaCodeData,
} from "../types/email.types.js";
import { formattedDate } from "../utils/formats.js";

dotenv.config();

// ========== Константы ==========
const COMPANY_NAME = 'ООО НПО "Полет"';
const FROM_NAME = COMPANY_NAME;
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? "587", 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_USER_PASSWORD,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  debug: true,
} as const;

// Сопоставление типов писем с их данными
export interface EmailDataMap {
  resetPassword: ResetPasswordData;
  newOrderUser: NewOrderUserData;
  newOrderAdmin: NewOrderAdminData;
  twofaCode: TwofaCodeData;
  orderCancelledByAdmin: OrderCancelledByAdminData;
  newProductReview: NewProductReviewData;
  orderShipped: OrderShippedData;
  orderReadyForPickup: OrderReadyForPickupData;
  newAttachment: NewAttachmentData;
  newLogin: NewLoginData;
  consentUpdated: ConsentUpdatedData;
  newFeedback: NewFeedbackEmailData;
  feedbackStatusChanged: FeedbackStatusChangedData;
  feedbackAssigned: FeedbackAssignedData;
  orderCancelledByUser: OrderCancelledByUserData;
  resetPasswordCompleted: ResetPasswordCompletedData;
}

// Параметры для отправки письма
export interface SendEmailParams<T extends EmailType> {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// ========== Создание транспортера ==========
function createTransporter(): Transporter {
  // Проверка обязательных переменных окружения
  if (!SMTP_CONFIG.host || !SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    throw new Error(
      "SMTP configuration is incomplete. Check environment variables.",
    );
  }

  return createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth: {
      user: SMTP_CONFIG.auth.user,
      pass: SMTP_CONFIG.auth.pass,
    },
    connectionTimeout: SMTP_CONFIG.connectionTimeout,
    greetingTimeout: SMTP_CONFIG.greetingTimeout,
    debug: SMTP_CONFIG.debug,
  });
}

// ========== Отправка письма ==========
async function sendMail(params: SendEmailParams<EmailType>): Promise<void> {
  const transporter = createTransporter();

  const mailOptions: SendMailOptions = {
    from: {
      name: FROM_NAME,
      address: SMTP_CONFIG.auth.user!,
    },
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Письмо отправлено на ${params.to}`);
  } catch (error) {
    console.error(`❌ Ошибка отправки письма на ${params.to}:`, error);
    throw new Error("Ошибка отправки письма");
  }
}

// ========== Генерация содержимого письма ==========
interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function generateEmailContent<T extends EmailType>(
  type: T,
  data: EmailDataMap[T],
): EmailContent {
  switch (type) {
    case "resetPassword": {
      const d = data as ResetPasswordData;
      return {
        subject: "Сброс пароля",
        text: `Привет, ${d.username}! Для сброса пароля перейдите по следующей ссылке: ${d.resetLink}`,
        html: renderTemplate("resetPassword", {
          resetLink: d.resetLink,
          companyName: COMPANY_NAME,
        }),
      };
    }

    case "newOrderUser": {
      const d = data as NewOrderUserData;
      const { order, customer, orderNumber } = d;

      // Форматирование даты
      const createdDate = new Date(order.createdAt).toLocaleString("ru-RU");

      // Подготовка сумм
      const subtotal = `${order.pricing.subtotal} ${order.pricing.currency}`;
      const discount = `${order.pricing.discount} ${order.pricing.currency}`;
      const total = `${order.pricing.total} ${order.pricing.currency}`;

      return {
        subject: `Заказ №${orderNumber} успешно создан`,
        text: `
      Здравствуйте, ${customer.name || customer.email}!
      Ваш заказ №${orderNumber} от ${createdDate} принят.

      Состав заказа:
      ${order.items.map((i) => `- ${i.name}  x${i.quantity} = ${i.totalPrice} ${order.pricing.currency}`).join("\n")}

      Сумма без скидки: ${subtotal}
      Скидка: ${discount}
      Итого к оплате: ${total}

      Способ доставки: ${order.delivery.method}
      Получатель: ${order.recipient.fullName}, тел. ${order.recipient.phone}

      Детали заказа: https://yourdomain.com/orders/${order.id}
    `,
        html: renderTemplate("newOrderUser", {
          orderNumber,
          order,
          customer,
          createdDate,
          subtotal,
          discount,
          total,
        }),
      };
    }
    case "newOrderAdmin": {
      const d = data as NewOrderAdminData;
      const total = d.orderData?.pricing?.total || 0;
      const currency = d.orderData?.pricing?.currency || "RUB";
      return {
        subject: `Новый заказ №${d.orderNumber}`,
        text: `Новый заказ.\nНомер: ${d.orderNumber}\nКлиент: ${d.customer?.name || "Не указано"}\nEmail: ${d.customer?.email || "Не указан"}\nТелефон: ${d.customer?.phone || "Не указан"}\nСумма: ${total} ${currency}\n\n${COMPANY_NAME}`,
        html: renderTemplate("newOrderAdmin", {
          ...d,
          companyName: COMPANY_NAME,
        }),
      };
    }

    case "twofaCode": {
      const d = data as TwofaCodeData;
      return {
        subject: "Код подтверждения входа",
        text: `Код подтверждения: ${d.code}\n\nСрок действия: ${d.expiresInMinutes} мин.\n\nЕсли вы не выполняли вход, не используйте код.\n\n${COMPANY_NAME}`,
        html: renderTemplate("twofaCode", {
          code: d.code,
          expiresInMinutes: d.expiresInMinutes,
          companyName: COMPANY_NAME,
        }),
      };
    }

    case "orderCancelledByAdmin": {
      const d = data as OrderCancelledByAdminData;
      const { order, reason, refundAmount, cancelledAt } = d;
      const formattedDate = new Date(cancelledAt).toLocaleDateString("ru-RU");
      const refundText = refundAmount
        ? `Сумма возврата: ${refundAmount} ${order.pricing.currency}`
        : "";

      return {
        subject: `Заказ №${order.orderNumber} отменен`,
        text: `
      Заказ №${order.orderNumber} от ${new Date(order.createdAt).toLocaleDateString("ru-RU")} отменен.

      Состав заказа:
      ${order.items.map((i) => `- ${i.name} x${i.quantity} = ${i.totalPrice} ${order.pricing.currency}`).join("\n")}

      Итого: ${order.pricing.total} ${order.pricing.currency}
      Причина отмены: ${reason}
      Дата отмены: ${formattedDate}
      ${refundText}

      Получатель: ${order.recipient.fullName}, тел. ${order.recipient.phone}
    `,
        html: renderTemplate("orderCancelledByAdmin", {
          order,
          reason,
          refundAmount,
          formattedDate,
          refundText,
        }),
      };
    }

    case "newProductReview": {
      const d = data as NewProductReviewData;
      const prosText = d.pros?.length
        ? `Достоинства: ${d.pros.join(", ")}\n`
        : "";
      const consText = d.cons?.length
        ? `Недостатки: ${d.cons.join(", ")}\n`
        : "";
      return {
        subject: "Новый отзыв на товар",
        text: `Новый отзыв на товар: ${d.productTitle}\n\nПользователь: ${d.userName}\nОценка: ${d.rating}/5\nКомментарий: ${d.comment}\n${prosText}${consText}Ссылка: https://yourdomain.com/admin/reviews/${d.reviewId}\n\n${COMPANY_NAME}`,
        html: renderTemplate("newProductReview", {
          ...d,
          companyName: COMPANY_NAME,
        }),
      };
    }

    case "orderShipped": {
      const d = data as OrderShippedData;
      const { order, trackingNumber, carrier, estimatedDelivery } = d;
      const createdDate = new Date(order.createdAt).toLocaleDateString("ru-RU");

      return {
        subject: `Заказ №${order.orderNumber} отправлен`,
        text: `
      Заказ №${order.orderNumber} от ${createdDate} передан в доставку.
      
      Состав заказа:
      ${order.items.map((i) => `- ${i.name} x${i.quantity} = ${i.totalPrice} ${order.pricing.currency}`).join("\n")}
      
      Итого: ${order.pricing.total} ${order.pricing.currency}
      Трек-номер: ${trackingNumber}
      Служба доставки: ${carrier}
      Ожидаемая дата: ${estimatedDelivery}
      
      Получатель: ${order.recipient.fullName}, тел. ${order.recipient.phone}
    `,
        html: renderTemplate("orderShipped", {
          order,
          trackingNumber,
          carrier,
          estimatedDelivery,
          createdDate,
          total: `${order.pricing.total} ${order.pricing.currency}`,
        }),
      };
    }

    // src/services/mail.service.ts
    case "orderReadyForPickup": {
      const d = data as OrderReadyForPickupData;
      const { order, pickupPoint } = d;

      return {
        subject: `Заказ №${order.orderNumber} готов к выдаче`,
        text: `Заказ №${order.orderNumber} готов к выдаче.\n\nПункт выдачи: ${pickupPoint.name}\nАдрес: ${pickupPoint.address}\nЧасы работы: ${pickupPoint.hours}\n\n${COMPANY_NAME}`,
        html: renderTemplate("orderReadyForPickup", {
          order,
          pickupPoint,
          companyName: COMPANY_NAME,
        }),
      };
    }

    case "newAttachment": {
      const d = data as NewAttachmentData;
      return {
        subject: `Новый файл в заказе №${d.orderNumber}`,
        text: `В заказ №${d.orderNumber} добавлен новый файл.\n\nНазвание: ${d.attachment.name}\nРазмер: ${d.attachment.size} байт\nТип: ${d.attachment.mimeType}\nДата загрузки: ${d.attachment.uploadedAt}`,
        html: renderTemplate("newAttachment", {
          orderNumber: d.orderNumber,
          attachment: d.attachment,
        }),
      };
    }

    case "newLogin": {
      const d = data as NewLoginData;
      return {
        subject: "Новый вход в аккаунт",
        text: `В аккаунт выполнен вход с нового устройства.\n\nIP-адрес: ${d.ip}\nУстройство: ${d.deviceType} ${d.deviceModel}\nОперационная система: ${d.os} ${d.osVersion}\nДата и время: ${d.date}\n\nЕсли это были не вы, немедленно смените пароль и проверьте активные сессии.`,
        html: renderTemplate("newLogin", {
          ip: d.ip,
          deviceType: d.deviceType,
          deviceModel: d.deviceModel,
          os: d.os,
          osVersion: d.osVersion,
          date: formattedDate(d.date),
        }),
      };
    }

    case "consentUpdated": {
      const d = data as ConsentUpdatedData;
      return {
        subject: `Обновлены условия: ${d.consentTitle}`,
        text: `Обновлены условия: ${d.consentTitle} (версия ${d.version} от ${d.updateDate}).\n\nИзменения:\n${d.changeDescription}\n\nНовая версия документа: ${d.documentUrl || "доступна на сайте"}\n\nДата вступления в силу: ${d.effectiveDate}\n\nПродолжение использования сервиса после указанной даты означает согласие с обновленными условиями.\n\nЕсли вы не согласны с изменениями, вы можете прекратить использование сервиса и удалить аккаунт в настройках.`,
        html: renderTemplate("consentUpdated", {
          consentTitle: d.consentTitle,
          version: d.version,
          updateDate: d.updateDate,
          changeDescription: d.changeDescription,
          documentUrl: d.documentUrl,
          effectiveDate: d.effectiveDate,
        }),
      };
    }

    case "newFeedback": {
      const d = data as NewFeedbackEmailData;
      return {
        subject: "Новый фидбек",
        text: `Новый фидбек.\n\nID: ${d.feedbackId}\nНазвание: ${d.title}\nТип: ${d.type}\nПользователь: ${d.userName} (${d.userEmail})\nПриоритет: ${d.priority}\nДата: ${formattedDate(d.createdAtRaw)}\n\nОписание:\n${d.description}`,
        html: renderTemplate("newFeedback", {
          feedbackId: d.feedbackId,
          title: d.title,
          type: d.type,
          userName: d.userName,
          userEmail: d.userEmail,
          priority: d.priority,
          createdAt: formattedDate(d.createdAtRaw),
          description: d.description,
        }),
      };
    }

    case "feedbackStatusChanged": {
      const d = data as FeedbackStatusChangedData;
      return {
        subject: `Обновлён статус обращения "${d.title}"`,
        text: `Здравствуйте, ${d.userName}!\n\nСтатус вашего обращения "${d.title}" изменён.\n\nID: ${d.feedbackId}\nСтарый статус: ${d.oldStatus}\nНовый статус: ${d.newStatus}\nДата: ${d.updatedAtFormatted}\n\nПерейти к обращению: ${d.feedbackUrl}\n${d.comment ? `\nКомментарий администратора:\n${d.comment}\n` : ""}`,
        html: renderTemplate("feedbackStatusChanged", {
          feedbackId: d.feedbackId,
          feedbackUrl: d.feedbackUrl,
          title: d.title,
          oldStatus: d.oldStatus,
          newStatus: d.newStatus,
          comment: d.comment,
          userName: d.userName,
          updatedAt: d.updatedAtFormatted,
        }),
      };
    }

    case "feedbackAssigned": {
      const d = data as FeedbackAssignedData;
      return {
        subject: `Вам назначен фидбек: "${d.title}"`,
        text: `Здравствуйте, ${d.assignedToName}!\n\nВам назначен фидбек "${d.title}".\n\nТип: ${d.type}\nПриоритет: ${d.priority}\nОписание: ${d.description}\nДата создания: ${d.createdAtFormatted}\nНазначил: ${d.assignedByName}\n\nПерейти к фидбеку: ${d.feedbackUrl}`,
        html: renderTemplate("feedbackAssigned", {
          feedbackId: d.feedbackId,
          feedbackUrl: d.feedbackUrl,
          title: d.title,
          type: d.type,
          priority: d.priority,
          description: d.description,
          createdAt: d.createdAtFormatted,
          assignedToName: d.assignedToName,
          assignedByName: d.assignedByName,
          assignedByEmail: d.assignedByEmail,
        }),
      };
    }

    case "orderCancelledByUser": {
      const { order } = data as OrderCancelledByUserData;
      const cancellation = order.cancellation || {};

      const formatDate = (date?: Date): string => {
        if (!date) return "не указана";
        return new Date(date).toLocaleString("ru-RU");
      };

      const itemsList = order.items
        .map(
          (i) =>
            `- ${i.name} x${i.quantity} = ${i.totalPrice} ${order.pricing.currency}`,
        )
        .join("\n");

      // Определяем текст инициатора по роли
      let cancelledByText = "неизвестно";
      if (cancellation.cancelledByRole === "user") {
        cancelledByText = "пользователь";
      } else if (cancellation.cancelledByRole === "admin") {
        cancelledByText = "администратор";
      } else if (cancellation.cancelledByRole === "system") {
        cancelledByText = "система";
      } else {
        cancelledByText = cancellation.cancelledBy || "пользователь";
      }

      return {
        subject: `Заказ №${order.orderNumber} отменен`,
        text: `
Заказ №${order.orderNumber} отменен.

Состав заказа:
${itemsList}

Итого: ${order.pricing.total} ${order.pricing.currency}
Причина отмены: ${cancellation.reason || "не указана"}
Инициатор отмены: ${cancelledByText}
Дата отмены: ${formatDate(cancellation.cancelledAt)}

Детали заказа: https://yourdomain.com/orders/${order.id}
    `,
        html: renderTemplate("orderCancelledByUser", {
          orderNumber: order.orderNumber,
          orderId: order.id,
          items: order.items,
          pricing: order.pricing,
          cancellation: {
            reason: cancellation.reason,
            cancelledByText, // передаём готовый текст
            cancelledAt: cancellation.cancelledAt,
          },
        }),
      };
    }

    case "resetPasswordCompleted": {
      const d = data as ResetPasswordCompletedData;
      return {
        subject: "Пароль учетной записи изменен",
        text: `Пароль учетной записи ${d.email} был изменен.\n\nЕсли это действие совершили не вы, выполните немедленную смену пароля и проверьте безопасность аккаунта.`,
        html: renderTemplate("resetPasswordCompleted", {
          name: d.name,
          email: d.email,
        }),
      };
    }

    default: {
      throw ApiError.BadRequest("Неверный тип уведомления");
    }
  }
}

// ========== Основная функция отправки уведомления ==========
export async function sendNotification<T extends EmailType>(
  email: string,
  type: T,
  data: EmailDataMap[T],
): Promise<void> {
  const { subject, text, html } = generateEmailContent(type, data);
  console.log("html", html);

  await sendMail({ to: email, subject, text, html });
  console.log(`📨 Уведомление "${type}" отправлено на ${email}`);
}
