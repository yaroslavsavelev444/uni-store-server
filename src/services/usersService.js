// services/user-service.js
const { default: mongoose } = require("mongoose");
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
      const users = await UserModel.find().sort({ createdAt: -1 }).lean();

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
      const allowedRoles = ["user", "admin", "superadmin"];
      if (!allowedRoles.includes(newRole)) {
        throw ApiError.BadRequest(
          `Недопустимая роль. Допустимые значения: ${allowedRoles.join(", ")}`,
          [],
          null
        );
      }

      // Проверка: админ не может изменить свою собственную роль
      if (userId.toString() === currentUser.id.toString()) {
        throw ApiError.BadRequest(
          "Вы не можете изменить свою собственную роль",
          [],
          null
        );
      }

      // Поиск пользователя
      const user = await UserModel.findById(userId);
      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден", null);
      }

      // Проверка: суперадмин может всё, обычный админ не может назначать суперадминов
      if (currentUser.role !== "superadmin" && newRole === "superadmin") {
        throw ApiError.ForbiddenError(
          "Только суперадмин может назначать роль суперадмина",
          null
        );
      }

      // Проверка: нельзя изменить роль другого суперадмина
      if (user.role === "superadmin" && currentUser.role !== "superadmin") {
        throw ApiError.ForbiddenError(
          "Только суперадмин может изменять роль другого суперадмина",
          null
        );
      }

      // Сохраняем старую роль для логирования
      const oldRole = user.role;

      // Обновляем роль
      user.role = newRole;
      await user.save();

      // Возвращаем обновленного пользователя без чувствительных данных
      const updatedUser = await UserModel.findById(userId).lean();

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
    return this.updateUserRole(userId, "admin", currentUser);
  }

  /**
   * Лишение пользователя админских прав (удобный метод-обёртка)
   * @param {string} userId - ID пользователя
   * @param {Object} currentUser - Текущий пользователь (админ)
   * @returns {Promise<Object>} Обновленный пользователь
   */
  async demoteToUser(userId, currentUser) {
    return this.updateUserRole(userId, "user", currentUser);
  }

  /**
   * Получение пользователя по ID (для внутреннего использования)
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>} Пользователь
   */
  async getUserById(userId) {
    try {
      const user = await UserModel.findById(userId)
       .select(`
  -password
  -tokens.resetToken
  -tokens.resetTokenStatus
  -tokens.resetTokenExpiration
  -passwordChangeHistory
  -__v
`)
        .lean();

      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден", null);
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
// services/user-service.js (исправленный метод searchUsers)
async searchUsers(searchParams) {
    try {
      const { query, status, role, page = 1, limit = 50 } = searchParams;
      const skip = (page - 1) * limit;

      // Строим базовый запрос
      let filter = {};

      // Обработка поискового запроса
      if (query && query.trim()) {
        const searchQuery = query.trim();

        // Пытаемся определить, что ввел пользователь
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchQuery);
        const isObjectId = mongoose.isValidObjectId(searchQuery);

        if (isEmail) {
          // Поиск по email
          filter.email = { $regex: searchQuery, $options: "i" };
        } else if (isObjectId) {
          // Поиск по ID
          filter._id = new mongoose.Types.ObjectId(searchQuery);
        } else {
          // Поиск по имени (может быть частичным совпадением)
          // Убираем tokens.resetToken из условия $or
          filter.$or = [
            { name: { $regex: searchQuery, $options: "i" } },
            { email: { $regex: searchQuery, $options: "i" } },
          ];
        }
      }

      // Фильтрация по статусу
      if (status && ["active", "blocked", "suspended"].includes(status)) {
        filter.status = status;
      }

      // Фильтрация по роли
      if (role && ["user", "admin", "superadmin"].includes(role)) {
        filter.role = role;
      }

      // Выполняем поиск с пагинацией, исключая поля с select: false
      const [users, total] = await Promise.all([
        UserModel.find(filter)
       .select(`
  -password
  -tokens.resetToken
  -tokens.resetTokenStatus
  -tokens.resetTokenExpiration
  -passwordChangeHistory
  -__v
`)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserModel.countDocuments(filter),
      ]);

      // Получаем дополнительные данные о блокировках для найденных пользователей
      const usersWithBlockInfo = users.map((user) => {
        const isBlocked = user.status === "blocked";
        let blockInfo = null;

        if (isBlocked && user.blockedUntil) {
          const now = new Date();
          const blockedUntil = new Date(user.blockedUntil);
          const timeLeft = blockedUntil - now;

          if (timeLeft > 0) {
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutesLeft = Math.floor(
              (timeLeft % (1000 * 60 * 60)) / (1000 * 60)
            );
            blockInfo = {
              blockedUntil: user.blockedUntil,
              timeLeft: `${hoursLeft}ч ${minutesLeft}м`,
              isPermanent: hoursLeft > 87600, // примерно 10 лет
            };
          }
        }

        return {
          ...user,
          blockInfo,
        };
      });

      return {
        users: usersWithBlockInfo,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Search error details:', error);
      throw ApiError.DatabaseError(
        `Ошибка при поиске пользователей: ${error.message}`,
        null
      );
    }
  }

  /**
   * Получение пользователя с полной информацией (включая историю санкций)
   * @param {string} userId - ID пользователя
   * @returns {Promise<Object>} Полная информация о пользователе
   */
  async getUserWithDetails(userId) {
    try {
      const user = await UserModel.findById(userId)
        .select(`
  -password
  -tokens.resetToken
  -tokens.resetTokenStatus
  -tokens.resetTokenExpiration
  -passwordChangeHistory
  -__v
`)
        .populate({
          path: "lastSanction",
          select: "reason duration expiresAt createdAt",
          populate: {
            path: "admin",
            select: "name email",
          },
        })
        .lean();

      if (!user) {
        throw ApiError.NotFoundError("Пользователь не найден", null);
      }

      return user;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.DatabaseError(
        `Ошибка при получении детальной информации о пользователе: ${error.message}`,
        null
      );
    }
  }
}

module.exports = new UserService();
