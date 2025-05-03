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

module.exports = {
  uploadOrgData,
  editOrgData,
  getOrg,
  updateOrgWithImage,
  findById,
  deleteOrgData
};
