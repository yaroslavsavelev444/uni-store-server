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
  });
};

// Универсальная отправка письма
const sendMail = async ({ to, subject, text, html }) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"MERN Delivery" <${process.env.SMTP_USER}>`,
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
        companyName: "MERN Delivery App",
      });
      break;
    }
    case "resetPassword": {
      subject = "Сброс пароля";
      text = `Привет, ${data.username}! Для сброса пароля перейдите по следующей ссылке: ${data.resetLink}`;
      html = renderTemplate("resetPassword", {
        resetLink: data.resetLink,
        companyName: "MERN Delivery App",
      });
      break;
    }

    case "newOrderUser": {
      subject = "📝 Новый заказ";
      html = renderTemplate("newOrderUser", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
      });
      break;
    }

    case "newOrderAdmin": {
      subject = "📝 Новый заказ";
      html = renderTemplate("newOrderAdmin", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
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
      subject = "📝 Заказ отменен";
      html = renderTemplate("orderCancelledByAdmin", {
        ...data,
        formattedDate: formattedDate(data.createdAt),
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
