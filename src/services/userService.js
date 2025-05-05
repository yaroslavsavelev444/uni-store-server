const ApiError = require("../exceptions/api-error");
const { UserModel } = require("../models/indexModels");

const toggleAssignAdminRules = async (userId) => {
  try {
    const userData = await UserModel.findById(userId);
    if (!userData) {
      throw ApiError.NotFound("Пользователь не найден");
    }
    userData.role = userData.role === "admin" ? "user" : "admin";
    await userData.save();
    return userData;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};


const getUsers = async (userId) => {
  try {
    const users = await UserModel.find({ _id: { $ne: userId } }) // исключаем userId
      .select("-password"); // исключаем пароль
    return users;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};

const deleteUser = async (userId) => {
  try {
    const userData = await UserModel.findByIdAndDelete(userId);
    return userData;
  } catch (error) {
    throw ApiError.InternalServerError(error.message || "Произошла ошибка");
  }
};

module.exports = {
  toggleAssignAdminRules,
  deleteUser,
  getUsers
};
