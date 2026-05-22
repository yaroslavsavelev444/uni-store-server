import type { Document, Types } from "mongoose";

export interface UserSanctionMetadata {
	ip?: string;
	userAgent?: string;
	additionalInfo?: any;
}

export interface UserSanctionDocument extends Document {
	user: Types.ObjectId;
	admin: Types.ObjectId;
	type: "block" | "warning" | "restriction";
	reason: string;
	duration: number; // hours, 0 = permanent
	expiresAt: Date;
	isActive: boolean;
	metadata: UserSanctionMetadata;
	createdAt: Date;
	updatedAt: Date;

	// Virtuals
	isExpired: boolean;
	remainingTime: string;
}

export interface BlockOptions {
	duration?: number; // hours, default 24
	reason?: string;
	type?: "block" | "warning" | "restriction";
	metadata?: Partial<UserSanctionMetadata>;
}
