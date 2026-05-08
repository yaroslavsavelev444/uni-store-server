// src/models/index.models.js

export { default as BannerModel } from "./banner-model.js";
export { default as BannerViewModel } from "./banner-view-model.js";
export { default as CartModel } from "./cart-model.js";
export { default as CategoryModel } from "./category-model.js";
export { default as CompanyModel } from "./company-model.js";
export { default as ConsentModel } from "./consent-model.js";
export { default as ContactModel } from "./contact-model.js";
export { default as ContentBlockModel } from "./content-block-model.js";
export { default as DiscountModel } from "./discount-model.js";
export { FaqQuestionModel, FaqTopicModel } from "./faq-model.js";
export { default as FeedbackModel } from "./feedback-model.js";
export { default as KeyEncryptModel } from "./key-encrypt-model.js";
export { default as MainMaterialModel } from "./main-material-model.js";
export { default as MessageModel } from "./message-model.js";
export { default as NotificationModel } from "./notification-model.js";
export { DeliveryMethod, OrderModel, OrderStatus } from "./order-model.js";
export { default as PickupPointModel } from "./pickup-point-model.js";
export { default as ProductModel } from "./product-model.js";
export { default as ProductReviewModel } from "./product-review-model.js";
export { default as PromoBlockModel } from "./promo-block-model.js";
export { default as RefundModel } from "./refund-model.js";
export { default as RoomModel } from "./room-model.js";
export { default as TokenModel } from "./token-model.js";
export { default as TopicModelCommon } from "./topic-model-common.js";
export { default as TransportCompanyModel } from "./transport-company-model.js";
export { default as UserAcceptedConsentModel } from "./user-accepted-consent-model.js";
export { default as UserModel } from "./user-model.js";
export { default as UserSanctionModel } from "./user-sanction-model.js";
export { default as UserSearchModel } from "./user-search-model.js";
export { default as UserSecurityModel } from "./user-security-model.js";
export { default as UserSessionModel } from "./user-session-model.js";
export { default as WishlistModel } from "./wishlist-model.js";

// Опционально: оставляем default экспорт для обратной совместимости (если где-то ещё используется)
export default {
  BannerModel,
  BannerViewModel,
  CartModel,
  CategoryModel,
  CompanyModel,
  ConsentModel,
  ContactModel,
  ContentBlockModel,
  DiscountModel,
  FaqQuestionModel,
  FaqTopicModel,
  FeedbackModel,
  KeyEncryptModel,
  MainMaterialModel,
  MessageModel,
  NotificationModel,
  DeliveryMethod,
  OrderModel,
  OrderStatus,
  PickupPointModel,
  ProductModel,
  ProductReviewModel,
  PromoBlockModel,
  RefundModel,
  RoomModel,
  TokenModel,
  TopicModelCommon,
  TransportCompanyModel,
  UserAcceptedConsentModel,
  UserModel,
  UserSanctionModel,
  UserSearchModel,
  UserSecurityModel,
  UserSessionModel,
  WishlistModel,
};
