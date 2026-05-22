// controllers/user-controller.js
const userService = require('../services/usersService');
const ApiError = require('../exceptions/api-error');
const userSanctionService = require('../services/userSanctionService');
const { default: mongoose } = require('mongoose');
class UserController {
  /**
   * Получение списка всех пользователей (только для админов)
   * GET /api/admin/users
   */
  async getAllUsers(req, res, next) {
    try {
      const currentUser = req.user;
      
      // Дополнительная проверка роли (на всякий случай)
      if (!['admin', 'superadmin'].includes(currentUser.role)) {
        return next(ApiError.ForbiddenError('Доступ только для администраторов', req));
      }

      const users = await userService.getAllUsers(currentUser);
      
      res.status(200).json({
        success: true,
        data: users,
        count: users.length,
        message: 'Список пользователей успешно получен'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Универсальное обновление роли пользователя
   * PATCH /api/admin/users/:userId/role
   */
  async updateUserRole(req, res, next) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const currentUser = req.user;

      // Валидация входных данных
      if (!role) {
        return next(ApiError.BadRequest('Поле "role" обязательно для заполнения', [], req));
      }

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      // Проверка формата ID
      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const updatedUser = await userService.updateUserRole(userId, role, currentUser);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: `Роль пользователя успешно обновлена на "${role}"`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Назначение пользователя администратором
   * POST /api/admin/users/:userId/promote
   */
  async promoteToAdmin(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUser = req.user;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const updatedUser = await userService.promoteToAdmin(userId, currentUser);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'Пользователь успешно назначен администратором'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Лишение пользователя админских прав
   * POST /api/admin/users/:userId/demote
   */
  async demoteToUser(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUser = req.user;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const updatedUser = await userService.demoteToUser(userId, currentUser);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'Пользователь успешно лишён админских прав'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение пользователя по ID (для админов)
   * GET /api/admin/users/:userId
   */
  async getUserById(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUser = req.user;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const user = await userService.getUserById(userId);
      
      res.status(200).json({
        success: true,
        data: user,
        message: 'Данные пользователя успешно получены'
      });
    } catch (error) {
      next(error);
    }
  }
  async searchUsers(req, res, next) {
    try {
      const {
        query,
        status,
        role,
        page = 1,
        limit = 50,
      } = req.query;

      const searchParams = {
        query,
        status,
        role,
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Ограничиваем максимум 100
      };

      const result = await userService.searchUsers(searchParams);
      
      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination,
        message: 'Поиск пользователей выполнен успешно'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Блокировка пользователя
   * POST /api/admin/users/:userId/block
   */
  async blockUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { duration, reason, type = 'block' } = req.body;
      const currentUser = req.user;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!mongoose.isValidObjectId(userId)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      if (duration !== 0 && (!duration || duration < 1)) {
        return next(ApiError.BadRequest('Длительность блокировки должна быть больше 0 или 0 для бессрочной', [], req));
      }

      const sanction = await userSanctionService.blockUser(userId, currentUser, {
        duration: parseInt(duration) || 0,
        reason: reason || 'Нарушение правил сообщества',
        type,
        metadata: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
      
      res.status(200).json({
        success: true,
        data: sanction,
        message: duration === 0 
          ? 'Пользователь заблокирован бессрочно' 
          : `Пользователь заблокирован на ${duration} часов`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Разблокировка пользователя
   * POST /api/admin/users/:userId/unblock
   */
  async unblockUser(req, res, next) {
    try {
      const { userId } = req.params;
      const currentUser = req.user;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!mongoose.isValidObjectId(userId)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const user = await userSanctionService.unblockUser(userId, currentUser);
      
      res.status(200).json({
        success: true,
        data: user,
        message: 'Пользователь успешно разблокирован'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение истории санкций пользователя
   * GET /api/admin/users/:userId/sanctions
   */
  async getUserSanctions(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!mongoose.isValidObjectId(userId)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const sanctions = await userSanctionService.getUserSanctions(userId);
      
      res.status(200).json({
        success: true,
        data: sanctions,
        count: sanctions.length,
        message: 'История санкций пользователя успешно получена'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение статуса блокировки пользователя
   * GET /api/admin/users/:userId/block-status
   */
  async getBlockStatus(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!mongoose.isValidObjectId(userId)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const status = await userSanctionService.checkUserBlockStatus(userId);
      
      res.status(200).json({
        success: true,
        data: status,
        message: 'Статус блокировки пользователя успешно получен'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Получение пользователя с детальной информацией
   * GET /api/admin/users/:userId/details
   */
  async getUserDetails(req, res, next) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return next(ApiError.BadRequest('ID пользователя обязателен', [], req));
      }

      if (!mongoose.isValidObjectId(userId)) {
        return next(ApiError.BadRequest('Неверный формат ID пользователя', [], req));
      }

      const user = await userService.getUserWithDetails(userId);
      
      res.status(200).json({
        success: true,
        data: user,
        message: 'Детальная информация о пользователе успешно получена'
      });
    } catch (error) {
      next(error);
    }
  }

}

module.exports = new UserController();