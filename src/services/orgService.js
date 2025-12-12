
const fs = require("fs/promises");
const path = require("path");
const ApiError = require("../exceptions/api-error");
const { OrgModel } = require("../models/index.models");

const findById = async (id) => {
  return OrgModel.findById(id);
};

const getOrg = async () => {
  try {
    const result = await OrgModel.find();
    console.log(result);
    return result;
  } catch (e) {
    throw ApiError.InternalServerError();
  }
};
const createOrganization = async (orgData) => {
  try {
    const org = new OrgModel(orgData);
    return await org.save();
  } catch (e) {
    throw ApiError.InternalServerError(e.message || "Ошибка загрузки компании");
  }
};

const editOrgData = async (orgData) => {
  return OrgModel.findByIdAndUpdate(orgData._id, orgData, { new: true });
};

const updateOrganization = async (id, orgData, file, uploadPath, filename, oldImagePath) => {
  if (file && oldImagePath) {
    const fullOldPath = path.join(__dirname, "..", oldImagePath);
    fs.unlink(fullOldPath, (err) => {
      if (err) console.error("Не удалось удалить старое изображение", err);
    });

    const newPath = path.join(uploadPath, filename).replace(/\\/g, "/");
    orgData.logo = newPath;
  }

  return await OrgModel.findByIdAndUpdate(id, orgData, { new: true });
};

const deleteOrganization = async (id) => {
  return OrgModel.findByIdAndDelete(id);
};

const uploadOrganizationFile = async (filesData, orgId) => {
  
  const org = await OrgModel.findById(orgId);

  if (!org) {
     throw ApiError.NotFoundError();
  }
  org.files = [...(org.files || []), ...filesData];
  await org.save();

  return org;
};

const deleteOrganizationFile = async (orgId, filePath) => {
  const org = await OrgModel.findById(orgId);
  if (!org) {
    throw ApiError.NotFoundError("Организация не найдена");
  }

  const fullPath = path.resolve(process.cwd(), "src", "uploads", filePath);

  try {
    await fs.access(fullPath); // Проверяем, доступен ли файл
    await fs.unlink(fullPath); // Удаляем
    console.log("Файл удалён:", fullPath);
  } catch (err) {
    console.warn("Файл не найден или не удалось удалить:", fullPath, err.message);
  }

  const originalLength = org.files.length;
  org.files = (org.files || []).filter(file => file.path !== filePath);
  console.log(`Удалено ${originalLength - org.files.length} файлов из массива`);

  await org.save();
  return org;
};

const addSocialLink = async (orgId, url, icons) => {
  const urls = Array.isArray(url) ? url : [url];

  if (!icons || icons.length !== urls.length) {
    throw ApiError.BadRequest("Отсутствует socialLinks");
  }

  const newSocialLinks = icons.map((file, index) => ({
    icon: `/uploads/social-icons/${file.filename}`,
    url: urls[index],
  }));

  const company = await OrgModel.findById(orgId);
  if (!company){
    throw ApiError.NotFoundError();
  }

  company.socialLinks = [...(company.socialLinks || []), ...newSocialLinks];
  await company.save();

  return company;
};

const deleteSocialLink = async (linkId) => {
  // Шаг 1: Находим компанию, содержащую ссылку
  const company = await OrgModel.findOne({ "socialLinks._id": linkId });

  if (!company) {
    throw ApiError.NotFoundError("Компания с данной ссылкой не найдена");
  }

  // Шаг 2: Получаем саму ссылку
  const linkToDelete = company.socialLinks.id(linkId);

  if (!linkToDelete) {
    throw ApiError.NotFoundError("Ссылка не найдена");
  }

  // Шаг 3: Формируем абсолютный путь к иконке
  const iconPath = path.resolve(__dirname, "..", linkToDelete.icon.replace(/^\//, ""));

  // Шаг 4: Пытаемся удалить иконку
  try {
    await fs.unlink(iconPath);
    console.log(`Файл ${iconPath} успешно удалён`);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Ошибка при удалении иконки:", err);
      throw ApiError.InternalServerError("Ошибка при удалении иконки");
    } else {
      console.warn("Файл уже удалён или не найден:", iconPath);
    }
  }

  // Шаг 5: Удаляем ссылку из массива
  company.socialLinks.pull(linkId);
  await company.save();

  return company;
};


module.exports = {
  createOrganization,
  addSocialLink,
  editOrgData,
  deleteOrganizationFile,
  getOrg,
  updateOrganization,
  findById,
  deleteOrganization,
  uploadOrganizationFile,
  deleteSocialLink
};
