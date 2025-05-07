
const fs = require("fs");
const path = require("path");
const ApiError = require("../exceptions/api-error");
const { OrgModel } = require("../models/indexModels");

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
const uploadOrgData = async (orgData) => {
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

const updateOrgWithImage = async (
  id,
  updatedData,
  file,
  uploadPath,
  savedFilename,
  oldImagePath
) => {
  if (file && uploadPath && savedFilename) {
    const newImagePath = path
      .join(uploadPath, savedFilename)
      .replace(/\\/g, "/");

    // Удаляем старую папку
    if (oldImagePath) {
      const oldFolder = oldImagePath.split("/").slice(0, -1).join("/");
      const fullOldFolderPath = path.join(__dirname, "..", oldFolder);

      if (fs.existsSync(fullOldFolderPath)) {
        fs.rmSync(fullOldFolderPath, { recursive: true, force: true });
      }
    }

    updatedData.image = newImagePath;
  }

  return editOrgData(updatedData);
};

const deleteOrgData = async (id) => {
  return OrgModel.findByIdAndDelete(id);
};

const uploadOrgFiles = async (filesData, orgId) => {
  
  const org = await OrgModel.findById(orgId);

  if (!org) {
     throw ApiError.NotFoundError();
  }
  org.files = [...(org.files || []), ...filesData];
  await org.save();

  return org;
};

const deleteOrgFile = async (orgId, filePath) => {
  const org = await OrgModel.findById(orgId);
  if (!org) {
    throw ApiError.NotFoundError("Организация не найдена");
  }

  const fullPath = path.resolve(process.cwd(), "src", "uploads", filePath);

  // Удаляем физически файл
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  } else {
    console.warn("Файл не найден на диске:", fullPath);
  }

  // Удаляем файл из массива
  const originalLength = org.files.length;
  org.files = (org.files || []).filter(file => file.path !== filePath);
  console.log(`Удалено ${originalLength - org.files.length} файлов из массива`);

  await org.save();

  return org;
};

const addOrgSocialLinks = async (orgId, url, icons) => {
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


module.exports = {
  uploadOrgData,
  addOrgSocialLinks,
  editOrgData,
  deleteOrgFile,
  getOrg,
  updateOrgWithImage,
  findById,
  deleteOrgData,
  uploadOrgFiles
};
