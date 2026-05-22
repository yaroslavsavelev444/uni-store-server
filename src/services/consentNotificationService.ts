import { format } from "date-fns";
import { ru } from "date-fns/locale";
import ApiError from "../exceptions/api-error.js";
import { UserModel } from "../models/index.models.js";
import {
  sendEmailNotification,
  sendPushNotification,
} from "../queues/taskQueues.js";
import type { EmailDataMap } from "../services/mailService.js";
import type { IUser } from "../types/user.types.js";

// ========== Типы ==========
interface ConsentData {
  title: string;
  version: string;
  documentUrl?: string;
  changeDescription?: string;
}

type NotificationChannel =
  | "email"
  | "sms"
  | "push"
  | "site"
  | "personal_account";

interface NotificationStats {
  totalUsers: number;
  notified: number;
  failed: number;
  channels: NotificationChannel[];
}

interface SendEmailData {
  consentTitle: string;
  version: string;
  updateDate: string;
  changeDescription: string;
  documentUrl?: string;
  effectiveDate: string;
  userName?: string; // сделано опциональным, если не используется
}

// Для push-уведомления
interface SendPushData {
  consentTitle: string;
  changeDescription: string;
  // version не нужен
}

interface UserWithId extends Pick<IUser, "email" | "name"> {
  _id: string;
}

class ConsentNotificationService {
  private async getActiveUsers(): Promise<UserWithId[]> {
    try {
      const users = await UserModel.find({
        email: { $exists: true, $ne: null },
      }).select("email name _id");
      return users.map((u) => ({
        _id: u._id.toString(),
        email: u.email,
        name: u.name,
      }));
    } catch (_error) {
      throw ApiError.InternalServerError(
        "Ошибка при получении списка пользователей",
      );
    }
  }

  async notifyUsersAboutConsentUpdate(
    consentData: ConsentData,
    notificationTypes: NotificationChannel[],
  ): Promise<NotificationStats> {
    try {
      const users = await this.getActiveUsers();
      const {
        title: consentTitle,
        version,
        documentUrl,
        changeDescription = "Изменения в условиях соглашения",
      } = consentData;

      const effectiveDate = format(
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        "dd MMMM yyyy",
        { locale: ru },
      );
      const updateDate = format(new Date(), "dd MMMM yyyy", { locale: ru });

      const notificationPromises: Promise<{
        success: boolean;
        email: string;
        error?: string;
      }>[] = [];

      if (notificationTypes.includes("email")) {
        notificationPromises.push(
          ...users.map((user) =>
            this.sendEmail(user, {
              consentTitle,
              version,
              updateDate,
              changeDescription,
              documentUrl,
              effectiveDate,
            }),
          ),
        );
      }

      if (notificationTypes.includes("sms")) {
        console.log(
          `📱 SMS уведомления будут отправлены ${users.length} пользователям`,
        );
      }

      if (notificationTypes.includes("push")) {
        notificationPromises.push(
          ...users.map((user) =>
            this.sendPush(user, {
              consentTitle,
              changeDescription,
            }),
          ),
        );
      }

      if (notificationTypes.includes("site")) {
        console.log(
          `🌐 Баннер уведомления будет показан на сайте для всех пользователей`,
        );
      }

      if (notificationTypes.includes("personal_account")) {
        console.log(
          `📋 Уведомление будет показано в личном кабинете ${users.length} пользователей`,
        );
      }

      const results = await Promise.allSettled(notificationPromises);
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      console.log(
        `📧 Уведомления отправлены: ${successful} успешно, ${failed} с ошибкой`,
      );

      return {
        totalUsers: users.length,
        notified: successful,
        failed,
        channels: notificationTypes,
      };
    } catch (error) {
      console.error("❌ Ошибка при отправке уведомлений:", error);
      const err = error as Error;
      throw ApiError.InternalServerError(
        `Ошибка отправки уведомлений: ${err.message}`,
      );
    }
  }

  private async sendEmail(
    user: UserWithId,
    data: Omit<SendEmailData, "userName">,
  ): Promise<{ success: boolean; email: string; error?: string }> {
    try {
      await sendEmailNotification(user.email, "consentUpdated", {
        consentTitle: data.consentTitle,
        version: data.version,
        updateDate: data.updateDate,
        changeDescription: data.changeDescription,
        documentUrl: data.documentUrl,
        effectiveDate: data.effectiveDate,
      } as EmailDataMap["consentUpdated"]);

      console.log(`✅ Email уведомление отправлено пользователю ${user.email}`);
      return { success: true, email: user.email };
    } catch (error) {
      const err = error as Error;
      console.error(
        `❌ Ошибка отправки email пользователю ${user.email}:`,
        err.message,
      );
      return { success: false, email: user.email, error: err.message };
    }
  }

  private async sendPush(
    user: UserWithId,
    data: SendPushData,
  ): Promise<{ success: boolean; email: string; error?: string }> {
    try {
      await sendPushNotification({
        userId: user._id,
        title: `Обновлено соглашение: ${data.consentTitle}`,
        body: data.changeDescription,
      });
      console.log(`✅ Push уведомление отправлено пользователю ${user.email}`);
      return { success: true, email: user.email };
    } catch (error) {
      const err = error as Error;
      console.error(
        `❌ Ошибка отправки push уведомления пользователю ${user.email}:`,
        err.message,
      );
      return { success: false, email: user.email, error: err.message };
    }
  }

  async logNotification(
    consentSlug: string,
    notificationStats: NotificationStats,
    adminId: string,
  ): Promise<boolean> {
    console.log(`📋 Логирование уведомлений для соглашения ${consentSlug}:`, {
      stats: notificationStats,
      adminId,
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

export default new ConsentNotificationService();
