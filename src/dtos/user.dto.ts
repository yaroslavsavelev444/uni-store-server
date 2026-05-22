import type { Types } from "mongoose";

/**
 * DTO для передачи данных пользователя клиенту (исключает чувствительные поля: password, tokens и т.д.)
 */
export class UserDTO {
  readonly id: Types.ObjectId | string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string | null;
  readonly role: "user" | "admin" | "superadmin";
  readonly createdAt?: Date | string;

  constructor(model: {
    _id: Types.ObjectId | string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    role: "user" | "admin" | "superadmin";
    createdAt?: Date | string;
  }) {
    this.id = model._id;
    this.name = model.name;
    this.email = model.email;
    this.avatarUrl = model.avatarUrl;
    this.role = model.role;
    this.createdAt = model.createdAt;
  }
}
