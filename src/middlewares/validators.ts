/** biome-ignore-all lint/correctness/noVoidTypeReturn: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import type { NextFunction, Request, Response } from "express";
import type Joi from "joi";
import { Types } from "mongoose";
import ApiError from "../exceptions/api-error.js";

/* ======================= TYPES ======================= */

export interface ValidationError {
  field: string;
  message: string;
  type?: string;
}

export type RequestProperty = "body" | "query" | "params";

export interface ValidatedRequest extends Request {
  validatedData?: any;
  validatedQuery?: any;
  files?: {
    [fieldname: string]: Express.Multer.File[] | Express.Multer.File;
  };
}

/* ======================= GENERAL VALIDATOR ======================= */

export const validate = (
  schema: Joi.Schema,
  property: RequestProperty = "body",
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors: ValidationError[] = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
        type: detail.type,
      }));

      return next(ApiError.BadRequest("Ошибка валидации", errors));
    }

    (req as ValidatedRequest)[property] = value;
    next();
  };
};

/* ======================= OBJECT ID ======================= */

export const validateObjectId = (paramName: string = "id") => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const id = req.params[paramName];

    // Защита от массивов (если несколько значений пришли)
    if (Array.isArray(id)) {
      return next(ApiError.BadRequest(`Некорректный формат ID: массив`));
    }

    if (!id || !Types.ObjectId.isValid(id)) {
      return next(ApiError.BadRequest(`Некорректный формат ID: ${id}`));
    }

    next();
  };
};

/* ======================= QUERY PARAMS ======================= */

export const validateQueryParams = (schema: Joi.Schema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      const errors: ValidationError[] = error.details.map((err) => ({
        field: err.path.join("."),
        message: err.message,
        type: err.type,
      }));

      return next(
        ApiError.BadRequest("Ошибка валидации параметров запроса", errors),
      );
    }

    (req as ValidatedRequest).validatedQuery = value;
    next();
  };
};

/* ======================= FILE UPLOAD ======================= */

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const handleFileUpload = (fieldName: string, maxCount: number = 10) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const files = (req as ValidatedRequest).files?.[fieldName];

    if (!files) {
      return next();
    }

    const fileArray = Array.isArray(files) ? files : [files];

    if (fileArray.length > maxCount) {
      return next(
        ApiError.BadRequest(`Максимальное количество файлов: ${maxCount}`),
      );
    }

    const invalidFiles = fileArray.filter(
      (file) => !ALLOWED_FILE_TYPES.includes(file.mimetype as any),
    );

    if (invalidFiles.length > 0) {
      return next(
        ApiError.BadRequest(
          "Недопустимый тип файла. Разрешены: JPG, PNG, WebP, PDF",
        ),
      );
    }

    next();
  };
};

/* ======================= PRODUCT VALIDATOR ======================= */

const parseJsonFields = (data: Record<string, any>): Record<string, any> => {
  const fieldsToParse = [
    "specifications",
    "images",
    "relatedProducts",
    "keywords",
    "customAttributes",
  ] as const;

  for (const field of fieldsToParse) {
    if (typeof data[field] === "string") {
      try {
        data[field] = JSON.parse(data[field]);
      } catch {
        throw new Error(`Некорректный JSON в поле ${field}`);
      }
    }
  }
  return data;
};

export const validateProduct = (schema: Joi.Schema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    let dataToValidate: Record<string, any> = { ...req.body };

    try {
      dataToValidate = parseJsonFields(dataToValidate);
    } catch (err: any) {
      return next(ApiError.BadRequest(err.message));
    }

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors: ValidationError[] = error.details.map((err) => ({
        field: err.path.join("."),
        message: err.message,
        type: err.type,
      }));

      return next(ApiError.BadRequest("Ошибка валидации продукта", errors));
    }

    (req as ValidatedRequest).validatedData = value;
    next();
  };
};

/* ======================= EXPORTS ======================= */

export default {
  validate,
  validateObjectId,
  validateQueryParams,
  handleFileUpload,
  validateProduct,
};
