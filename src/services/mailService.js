const nodemailer = require("nodemailer");
const renderTemplate = require("../emailTemplates/renderer");
const { formattedDate } = require("../utils/formats");
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

    case "rentalCancelled": {
      subject = "🚗 Аренда отменена";
      text = `Здравствуйте, ${data.name},\n\nАренда автомобиля ${
        data.car.brand
      } ${data.car.model} (${data.car.licensePlate}) с ${
        data.rental.startDate
      } по ${data.rental.endDate} была отменена.\nПричина: ${
        data.cancelInputValue || "Не указана"
      }`;
      html = renderTemplate("rentalCancelled", data);
      break;
    }

    case "rentalEnded": {
      subject = `✅ Аренда завершена: ${data.car.brand} ${data.car.model}`;
      text = `Здравствуйте, ${data.name},\n\nАренда автомобиля ${data.car.brand} ${data.car.model} (${data.car.licensePlate}) завершена.\nПериод: ${data.rental.startDate} – ${data.rental.endDate}`;
      html = renderTemplate("rentalEnded", data);
      break;
    }
    case "rentalStarted": {
      subject = `Аренда вашего автомобиля ${data.car.brand} ${data.car.model} (${data.car.licensePlate}) началась`;
      text = `Уважаемый(ая) ${data.name},\n\nАренда вашего автомобиля ${data.car.brand} ${data.car.model} (${data.car.licensePlate}) началась.\nПериод аренды: ${data.rental.startDate} - ${data.rental.endDate}\nСпасибо, что выбрали наш сервис!`;
      html = renderTemplate("rentalStarted", data);
      break;
    }

    case "rentalReminder": {
      subject = `Напоминание об аренде ${data.car.brand} ${data.car.model}`;
      text = `Уважаемый(ая), напоминание об аренде с ${data.startDate} до ${data.endDate}`;
      html = renderTemplate("rentalReminder", data);
      break;
    }

    case "cancelledOtherRequests": {
      subject = "🚫 Отменены другие заявки";
      text = `Ваша одобренная заявка повлекла за собой отмену остальных. Если вы этого не делали — свяжитесь с нами: ${
        data.link || "support@rentalos.com"
      }`;
      html = renderTemplate("cancelledOtherRequests", data);
      break;
    }

    case "accountBlocked": {
      subject = "📝 🚫 Ваш аккаунт был заблокирован";
      text = `К сожалению, ваш рейтинг упал ниже допустимого значения`;
      html = renderTemplate("accountBlocked", {
        ...data,
        updatedRating: data.updatedRating?.toFixed(2) || "—",
      });
      break;
    }

    case "newRequest": {
      subject = `Заявка на ${data.model || "неизвестная модель"} ${
        data.brand || "неизвестный бренд"
      } (${data.licensePlate || "не указан"})`;
      text = `Новая заявка от ${data.date}, автомобиль: ${data.brand} ${data.model}, номер: ${data.licensePlate}`;
      html = renderTemplate("newRequest", data);
      break;
    }

    case "requestRejected": {
      subject = "🚫 Заявка отклонена";
      text = `Ваша заявка на: ${data.model || "Неизвестная модель"} ${
        data.brand || "Неизвестный бренд"
      } была отклонена`;
      html = renderTemplate("requestRejected", data);
      break;
    }

    case "carReady": {
      subject = `Ваш автомобиль готов к получению`;
      text = `Привет, ${data.username}! Ваш автомобиль ${data.brand} ${data.model} (${data.licensePlate}) готов к получению. Посмотрите адрес здесь: ${data.mapLink}`;
      html = renderTemplate("carReady", {
        name: data.name,
        brand: data.brand,
        model: data.model,
        licensePlate: data.licensePlate,
        mapLink: data.mapLink,
        companyName: "MERN Delivery App",
      });
      break;
    }

    case "forOtherOrderReciever": {
      subject = `${data.ownerName} назначил вас получатлем заказа ${data.order._id} от ${data.createdAt}`;
      text = `Привет, ${data.order.otherRecieverDetails.recieverName}! Вы назначены получателем заказа ${data.order._id} от ${data.createdAt}. Посмотрите адрес здесь: ${data.order.mapLink}`; //TODO
      html = renderTemplate("forOtherOrderReciever", {
        name: data.order.otherRecieverDetails.recieverName,
        orderId: data.order._id,
        fromDate: data.createdAt,
        mapLink: data.order.mapLink, //TODO
        createdAt: formattedDate(data.createdAt),
        addressDetails: data.order.addressesDetails,
        ownerName: data.ownerName,
        carData: data.carData,
        companyName: "MERN Delivery App",
      });
      break;
    }

    default:
      throw new Error(`Тип уведомления "${type}" не поддерживается`);
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
