// types/reviews-controller.ts
import type { Query } from "express-serve-static-core";
import type { ReviewsService } from "../../services/reviewService.js";
import type { AuthRequest, OptionalAuthRequest } from "../auth.js";
import type {
  ProductReviewDocument,
  ReviewStatus,
} from "../productReview.types.js";

// ==================== Параметры маршрутов ====================

export interface ProductIdParams {
  productId: string;
}

export interface ReviewIdParams {
  reviewId: string;
}

// ==================== Query-параметры ====================

export interface GetReviewsQuery extends Query {
  status?: ReviewStatus | "all";
  sort?: string;
}

export interface GetAllReviewsQuery extends Query {
  status?: ReviewStatus;
  productId?: string;
  userId?: string;
  sort?: string;
}

export interface GetUserReviewsQuery extends Query {
  status?: ReviewStatus | "all";
  sort?: string;
}

// ==================== Тело запроса ====================

export interface CreateReviewBody {
  rating: number;
  title?: string;
  comment: string;
  pros?: string | string[];
  cons?: string | string[];
}

export interface UpdateReviewStatusBody {
  status: ReviewStatus;
}

// ==================== Ответы ====================

export type GetProductReviewsResponse = Awaited<
  ReturnType<ReviewsService["getProductReviews"]>
>;

export type GetProductReviewsStatsResponse = Awaited<
  ReturnType<ReviewsService["getProductReviewsStats"]>
>;

export type GetUserReviewsResponse = ProductReviewDocument[];

export type CreateReviewResponse = ProductReviewDocument;

export type UpdateReviewStatusResponse = ProductReviewDocument;

export type GetAllReviewsResponse = ProductReviewDocument[];

export type GetReviewByIdResponse = ProductReviewDocument;

// ==================== Типизированные запросы ====================

// GET /products/:productId/reviews
export type GetProductReviewsReq = OptionalAuthRequest<
  ProductIdParams,
  GetProductReviewsResponse,
  unknown,
  GetReviewsQuery
>;

// GET /products/:productId/reviews/stats
export type GetProductReviewsStatsReq = AuthRequest<
  ProductIdParams,
  GetProductReviewsStatsResponse
>;

// GET /user/reviews
export type GetUserReviewsReq = AuthRequest<
  unknown,
  GetUserReviewsResponse,
  unknown,
  GetUserReviewsQuery
>;

// POST /products/:productId/reviews
export type CreateReviewReq = AuthRequest<
  ProductIdParams,
  CreateReviewResponse,
  CreateReviewBody
>;

// PATCH /reviews/:reviewId/status (или PUT)
export type UpdateReviewStatusReq = AuthRequest<
  ReviewIdParams,
  UpdateReviewStatusResponse,
  UpdateReviewStatusBody
>;

// GET /reviews (админка)
export type GetAllReviewsReq = AuthRequest<
  unknown,
  GetAllReviewsResponse,
  unknown,
  GetAllReviewsQuery
>;

// GET /reviews/:reviewId
export type GetReviewByIdReq = AuthRequest<
  ReviewIdParams,
  GetReviewByIdResponse
>;
