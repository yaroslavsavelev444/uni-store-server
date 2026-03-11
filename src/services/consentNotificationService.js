import { format } from "date-fns";
import { ru } from "date-fns/locale";
import ApiError from "../exceptions/api-error.js";

const { InternalServerError } = ApiError;

import { UserModel } from "../models/index.models.js";
import {
  sendEmailNotification,
  sendPushNotification,
} from "../queues/taskQueues.js";

class ConsentNotificationService {
  // Получаем всех активных пользователей
  async getActiveUsers() {
    try {
      const users = await UserModel.find({
        email: { $exists: true, $ne: null },
      }).select("email name _id"); // Добавьте _id для push-уведомлений

      return users;
    } catch (error) {
      throw InternalServerError("Ошибка при получении списка пользователей");
    }
  }

  // Отправляем уведомления пользователям
  async notifyUsersAboutConsentUpdate(consentData, notificationTypes) {
    try {
      const users = await this.getActiveUsers();
      const {
        title: consentTitle,
        version,
        documentUrl,
        changeDescription,
      } = consentData;

      // Добавляем 10 дней для даты вступления в силу
      const effectiveDate = format(
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        "dd MMMM yyyy",
        { locale: ru },
      );
      const updateDate = format(new Date(), "dd MMMM yyyy", { locale: ru });

      // Отправляем уведомления по выбранным каналам
      const notificationPromises = [];

      if (notificationTypes.includes("email")) {
        notificationPromises.push(
          ...users.map((user) =>
            this.sendEmail(user, {
              consentTitle,
              version,
              updateDate,
              changeDescription:
                changeDescription || "Изменения в условиях соглашения",
              documentUrl,
              effectiveDate,
              notificationTypes,
            }),
          ),
        );
      }

      // Здесь можно добавить логику для других каналов (SMS, push, etc.)
      if (notificationTypes.includes("sms")) {
        console.log(
          `📱 SMS уведомления будут отправлены ${users.length} пользователям`,
        );
        // Реализация отправки SMS
      }

      if (notificationTypes.includes("push")) {
        // ИСПРАВЛЕНО: должно быть 'push', а не 'site'
        notificationPromises.push(
          ...users.map((user) =>
            this.sendPush(user, {
              consentTitle,
              version,
              updateDate,
              changeDescription:
                changeDescription || "Изменения в условиях соглашения",
              documentUrl,
              effectiveDate,
              notificationTypes,
            }),
          ),
        );
      }

      // Для 'site' уведомлений - не отправляем отдельным пользователям
      // Это баннер на сайте, который показывается всем
      if (notificationTypes.includes("site")) {
        console.log(
          `🌐 Баннер уведомления будет показан на сайте для всех пользователей`,
        );
        // Здесь можно сохранить флаг в базу данных для показа баннера
      }

      // Для 'personal_account' - уведомление в ЛК
      if (notificationTypes.includes("personal_account")) {
        console.log(
          `📋 Уведомление будет показано в личном кабинете ${users.length} пользователей`,
        );
        // Здесь можно сохранить уведомления в базу для отображения в ЛК
      }

      // Ждем завершения всех обещаний
      const results = await Promise.allSettled(notificationPromises);

      // Анализируем результаты
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      console.log(
        `📧 Уведомления отправлены: ${successful} успешно, ${failed} с ошибкой`,
      );

      // Возвращаем статистику
      return {
        totalUsers: users.length,
        notified: successful,
        failed: failed,
        channels: notificationTypes,
      };
    } catch (error) {
      console.error("❌ Ошибка при отправке уведомлений:", error);
      throw InternalServerError(
        `Ошибка отправки уведомлений: ${error.message}`,
      );
    }
  }

  // Отправка email уведомления
  async sendEmail(user, data) {
    try {
      // Используем переименованную функцию из очереди
      await sendEmailNotification(user.email, "consentUpdated", {
        ...data,
        userName: `${user.name || ""}`.trim() || "Уважаемый пользователь",
      });

      console.log(`✅ Email уведомление отправлено пользователю ${user.email}`);

      return { success: true, email: user.email };
    } catch (error) {
      console.error(
        `❌ Ошибка отправки email пользователю ${user.email}:`,
        error.message,
      );
      return { success: false, email: user.email, error: error.message };
    }
  }

  // Отправка push уведомления
  async sendPush(user, data) {
    try {
      // Используем переименованную функцию из очереди
      await sendPushNotification({
        userId: user._id, // ИСПРАВЛЕНО: user.id -> user._id
        title: `Обновлено соглашение: ${data.consentTitle}`,
        body: data.changeDescription || "Изменения в условиях соглашения",
      });

      console.log(`✅ Push уведомление отправлено пользователю ${user.email}`);
      return { success: true, email: user.email };
    } catch (error) {
      console.error(
        `❌ Ошибка отправки push уведомления пользователю ${user.email}:`,
        error.message,
      );
      return { success: false, email: user.email, error: error.message };
    }
  }

  // Логирование отправки уведомлений
  async logNotification(consentSlug, notificationStats, adminId) {
    // Здесь можно добавить логику сохранения в базу данных
    // для отслеживания истории уведомлений
    console.log(`📋 Логирование уведомлений для соглашения ${consentSlug}:`, {
      stats: notificationStats,
      adminId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }
}

export default new ConsentNotificationService();
