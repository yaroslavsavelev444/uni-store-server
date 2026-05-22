import type { Types } from "mongoose";

export interface IKeyEncrypt {
	_id: Types.ObjectId;
	version: number;
	dekEncrypted: string; // base64 of (iv + ciphertext + authTag)
	createdAt: Date;
	active: boolean;
	comment?: string;
}

export interface ActiveKeyResult {
	dek: Buffer;
	version: number;
}

export interface RotateKeyOptions {
	comment?: string;
}

export type EncryptedString = string; // Format: ENC|v{version}|{base64payload}
