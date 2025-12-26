// services/user-service.js
const ApiError = require("../exceptions/api-error");
const { UserModel } = require("../models/index.models");

class UserService {
  /**
   * Получить всех пользователей (без пагинации)
   * @param {Object} currentUser - Текущий пользователь (админ)
   * @returns {Promise<Array>} Список пользователей
   */
  async getAllUsers(currentUser) {
    try {
      // Можно добавить фильтрацию, исключая текущего пользователя если нужно
      const users = await UserModel.find()
        .sort({ createdAt: -1 })
        .lean();

      return users;
    } catch (error) {
      throw ApiError.DatabaseError(
        `Ошибка при получении списка пользователей: ${error.message}`,
        null
      );
    }
  }

  /**
   * Универсальное обновление роли пользователя
   * @param {string} userId - ID пользователя для обновления
   * @param {string} newRole - Новая роль (user/admin/superadmin)
   * @param {Object} currentUser - Текущий пользователь (админ)
   * @returns {Promise<Object>} Обновленный пользователь
   */
  async updateUserRole(userId, newRole, currentUser) {
    try {
      // Валидация новой роли
      const allowedRoles = ['user', 'admin', 'superadmin'];
      if (!allowedRoles.includes(newRole)) {
        throw ApiError.BadRequest(
          `Недопустимая роль. Допустимые значения: ${allowedRoles.join(', ')}`,
          [],
          null
        );
      }

      // Проверка: админ не может изменить свою собственную роль
      if (userId.toString() === currentUser.id.toString()) {
        throw ApiError.BadRequest(
          'Вы не можете изменить свою собственную роль',
          [],
          null
        );
      }

      // Поиск пользователя
      const user = await UserModel.findById(userId);
      if (!user) {
        throw ApiError.NotFoundError('Пользователь не найден', null);
      }

      // Проверка: суперадмин может всё, обычный админ не может назначать суперадминов
      if (currentUser.role !== 'superadmin' && newRole === 'superadmin') {
        throw ApiError.ForbiddenError(
          'Только суперадмин может назначать роль суперадмина',
          null
        );
      }

      // Проверка: нельзя изменить роль другого суперадмина
      if (user.role === 'superadmin' && currentUser.role !== 'superadmin') {
        throw ApiError.ForbiddenError(
          'Только суперадмин может изменять роль другого суперадмина',
          null
        );
      }

      // Сохраняем старую роль для логирования
      const oldRole = user.role;

      // Обновляем роль
      user.role = newRole;
      await user.save();

      // Возвращаем обновленного пользователя без чувствительных данных
      const updatedUser = await UserModel.findById(userId)
        .lean();

      // Логирование (опционально)
      console.log(
        `Пользователь ${currentUser.id} изменил роль пользователя ${userId} с ${oldRole} на ${newRole}`
      );

      return updatedUser;
    } catch (error) {
      // Если ошибка уже является ApiError, просто пробрасываем её
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw ApiError.DatabaseError(
        `Ошибка при обновлении роли пользователя: ${error.message}`,
        null
      );
    }
  }

  /**
   * Назначение пользователя админом (удобный метод-обёртка)
   * @param {string} userId - ID пользователя
   * @param {Object} currentUser - Текущий пользователь (админ)
   * @returns {Promise<Object>} Обновленный пользователь
   */
  async promoteToAdmin(userId, currentUser) {
    return this.updateUserRole(userId, 'admin', currentUser);
  }

  /**
   * Лишение пользователя админских прав (удобный метод-обёртка)
   * @param {string} userId - ID пользователя
   * @param {Object} currentUser - Текущий пользователь (админ)
   * @returns {Promise<Object>} Обновленный пользователь
   */
  async demoteToUser(userId, currentUser) {
    return this.updateUserRole(userId, 'user', currentUser);
  }

  /**
   * Получение пользователя по ID (для внутреннего использования)
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>} Пользователь
   */
  async getUserById(userId) {
    try {
      const user = await UserModel.findById(userId)
        .select('-password -tokens -passwordChangeHistory -__v')
        .lean();

      if (!user) {
        throw ApiError.NotFoundError('Пользователь не найден', null);
      }

      return user;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.DatabaseError(
        `Ошибка при получении пользователя: ${error.message}`,
        null
      );
    }
  }
}

module.exports = new UserService();