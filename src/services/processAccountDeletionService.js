// Импорт всех моделей (поправьте пути, если у вас другая структура папок)
const {
  UserModel,
  CartModel,
  WishlistModel,
  NotificationModel,
  BannerViewModel,
  SessionModel,
  TokenModel,
  UserAcceptedConsentModel,
  UserSanctionModel,
  UserSearchModel,
  UserSecurityModel,
  UserSessionModel,
  OrderModel,
  PaymentModel,
  RefundModel,
  CompanyModel,
  ProductReviewModel,
  FeedbackModel,
} = require("../models/index.models");
const logger = require("../logger/logger");

const processAccountDeletion = async (userId) => {
  if (!userId) throw new Error("userId обязателен");

  try {
    // 1. Полностью удаляем всё, что не нужно хранить
    await CartModel.deleteOne({ user: userId });
    await WishlistModel.deleteOne({ user: userId });
    await NotificationModel.deleteMany({ userId });
    await BannerViewModel.deleteMany({ userId });
    await SessionModel.deleteMany({ user: userId });
    await TokenModel.deleteMany({ user: userId });
    await UserAcceptedConsentModel.deleteMany({ userId });
    await UserSanctionModel.deleteMany({ user: userId });
    await UserSearchModel.deleteMany({ userId });
    await UserSecurityModel.deleteOne({ userId });
    await UserSessionModel.deleteMany({ userId });

    // 2. Анонимизируем данные, которые нужно хранить по закону (бухгалтерия, налоги)
    await OrderModel.updateMany(
      { user: userId },
      {
        $set: {
          user: null,
          "recipient.fullName":
            "Анонимизировано по запросу на удаление аккаунта",
          "recipient.phone": null,
          "recipient.email": null,
          "recipient.contactPerson": null,
        },
      },
    );

    await PaymentModel.updateMany({ user: userId }, { $set: { user: null } });

    await RefundModel.updateMany(
      { userId },
      { $set: { userId: null, userEmail: null } },
    );

    await CompanyModel.updateMany(
      { user: userId },
      {
        $set: {
          user: null,
          contactPerson: null,
          phone: null,
          email: null,
        },
      },
    );

    // 3. Анонимизируем публичные/пользовательские данные
    await ProductReviewModel.updateMany(
      { user: userId },
      { $set: { user: null } },
    );
    await FeedbackModel.updateMany(
      { userId },
      { $set: { userId: null, userEmail: null, userName: null } },
    );

    // 4. Финально удаляем сам аккаунт пользователя
    await UserModel.deleteOne({ _id: userId });

    logger.info(
      `✅ Данные пользователя ${userId} успешно удалены/анонимизированы`,
    );
  } catch (error) {
    logger.error(
      `❌ Ошибка при удалении данных пользователя ${userId}:`,
      error,
    );
    throw error;
  }
};

module.exports = { processAccountDeletion };
