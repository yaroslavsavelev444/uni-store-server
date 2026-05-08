import ApiError from "../exceptions/api-error.js";
import { UserModel } from "../models/index.models.js";

const updateUserRole = async (userId) => {
  try {
    const userData = await UserModel.findById(userId);
    if (!userData) {
      throw ApiError.NotFoundError("Пользователь не найден");
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

export default {
  updateUserRole,
  deleteUser,
  getUsers,
};

export { deleteUser, getUsers, updateUserRole };
