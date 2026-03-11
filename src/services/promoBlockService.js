import { existsSync, unlink } from "node:fs";
import { unlink as _unlink } from "node:fs/promises";
import { join } from "node:path";
import ApiError from "../exceptions/api-error.js";

const { InternalServerError, NotFoundError } = ApiError;

import { MainMaterialModel, PromoBlockModel } from "../models/index.models.js";

const createPromoBlock = async (data) => {
  const block = new PromoBlockModel(data);
  return await block.save();
};
const getPromoBlock = async ({ page }) => {
  return await PromoBlockModel.find({ page });
};

const updatePromoBlock = async (id, updateData) => {
  return await PromoBlockModel.findByIdAndUpdate(id, updateData, {
    new: true,
  });
};

const deletePromoBlock = async (id) => {
  const promoBlock = await PromoBlockModel.findById(id);
  if (!promoBlock) {
    throw NotFoundError("Промо блок не найден");
  }

  const relativePath = promoBlock.image.startsWith("/")
    ? promoBlock.image.slice(1)
    : promoBlock.image;

  const instructionPath = join(__dirname, "..", relativePath);
  console.log("Путь к файлу для удаления:", instructionPath);

  try {
    if (existsSync(instructionPath)) {
      await _unlink(instructionPath);
    }
  } catch (e) {
    console.error("Ошибка при удалении файла:", e.message);
    throw InternalServerError("Произошла ошибка при удалении промо блока");
  }

  return await PromoBlockModel.findByIdAndDelete(id);
};

const createMainMaterial = async (data) => {
  const material = new MainMaterialModel(data);
  return await material.save();
};

const updateMainMaterial = async (id, updateData) => {
  return await MainMaterialModel.findByIdAndUpdate(id, updateData, {
    new: true,
  });
};

const deleteMainMaterial = async (id) => {
  const material = await MainMaterialModel.findById(id);
  if (!material) throw NotFoundError("Материал не найден");

  const relativePath = material.mediaUrl.startsWith("/")
    ? material.mediaUrl.slice(1)
    : material.mediaUrl;

  const absolutePath = join(__dirname, "..", relativePath);
  try {
    await unlink(absolutePath);
  } catch (e) {
    console.warn("Файл не найден или уже удален:", e.message);
  }

  return await MainMaterialModel.findByIdAndDelete(id);
};

const getMainMaterials = async () => {
  return await MainMaterialModel.find().sort({ createdAt: -1 }); // последние первыми
};

export {
  createPromoBlock,
  getPromoBlock,
  deletePromoBlock,
  updatePromoBlock,
  createMainMaterial,
  updateMainMaterial,
  deleteMainMaterial,
  getMainMaterials,
};
