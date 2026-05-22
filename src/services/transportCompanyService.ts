// services/TransportCompanyService.ts
import { Types } from "mongoose";
import { TransportCompanyModel } from "../models/index.models.js";
import type { ITransportCompany } from "../types/transportCompany.types.js";

interface CreateTransportCompanyData {
  name: string;
  isActive?: boolean;
}

class TransportCompanyService {
  /**
   * Получить все активные транспортные компании (для пользователя)
   */
  async getActive(): Promise<ITransportCompany[]> {
    return await TransportCompanyModel.find({ isActive: true })
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Получить все компании, включая неактивные (для админа)
   */
  async getAll(): Promise<ITransportCompany[]> {
    return await TransportCompanyModel.find().sort({ name: 1 }).lean();
  }

  /**
   * Создать новую транспортную компанию
   */
  async create(data: CreateTransportCompanyData): Promise<ITransportCompany> {
    const company = new TransportCompanyModel(data);
    await company.save();
    return company.toObject();
  }

  /**
   * Обновить транспортную компанию
   */
  async update(
    id: string | Types.ObjectId,
    data: Partial<CreateTransportCompanyData>,
  ): Promise<ITransportCompany> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw new Error("Некорректный идентификатор транспортной компании");
    }

    const company = await TransportCompanyModel.findById(id);
    if (!company) {
      throw new Error("Транспортная компания не найдена");
    }

    if (data.name !== undefined) company.name = data.name;
    if (data.isActive !== undefined) company.isActive = data.isActive;

    await company.save();
    return company.toObject();
  }

  /**
   * Удалить транспортную компанию
   */
  async delete(id: string | Types.ObjectId): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(id.toString())) {
      throw new Error("Некорректный идентификатор транспортной компании");
    }

    const result = await TransportCompanyModel.findByIdAndDelete(id);
    if (!result) {
      throw new Error("Транспортная компания не найдена");
    }
    return { success: true };
  }
}

export default new TransportCompanyService();
