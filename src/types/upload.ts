// types/upload.ts
import type { Request } from "express";
import multer from "multer"; // 👈 Добавьте импорт

export type UploadField = string | string[];

export interface MulterMiddlewareOptions {
	fields: UploadField;
	uploadDir?: string;
	maxFileSizeMB?: number;
	maxFiles?: number;
	imagesOnly?: boolean;
	useTemp?: boolean;
}

export interface UploadedFile {
	fieldname: string;
	originalname: string;
	encoding: string;
	mimetype: string;
	destination: string;
	filename: string;
	path: string;
	size: number;
}

export interface UploadRequest extends Request {
	files?:
		| Express.Multer.File[]
		| { [fieldname: string]: Express.Multer.File[] };
	file?: Express.Multer.File;
	uploadedFiles?:
		| Express.Multer.File[]
		| { [fieldname: string]: Express.Multer.File[] }
		| null;
}

export type FileFilterCallback = (
	error: Error | null,
	acceptFile: boolean,
) => void;

// ✅ Исправлено: правильное расширение типов
declare global {
	namespace Express {
		namespace Multer {
			interface File {
				fieldname: string;
				originalname: string;
				encoding: string;
				mimetype: string;
				size: number;
				destination: string;
				filename: string;
				path: string;
				buffer: Buffer;
			}
		}
	}
}
