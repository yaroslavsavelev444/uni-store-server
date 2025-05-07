const ApiError = require("../exceptions/api-error");
const ordersService = require("../services/ordersService");
const getOrders = async (req, res, next) => {
  try {
    const result = await ordersService.getOrders(req.user);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const getCompanies = async (req, res, next) => {
  try {
    const result = await ordersService.getCompanies(req.user.id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const cancelOrder = async (req, res, next) => {
  const { id } = req.body;
  
  if (!id) {
    throw ApiError.BadRequest("Отсутствует id");
  }

  try {
    const result = await ordersService.cancelOrder(id, req.user);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const data = req.body;
    if (!data) {
      throw ApiError.BadRequest("Отсутствует data");
    }
    const order = await ordersService.createOrder(req.user, data);
    res.status(200).json(order);
  } catch (e) {
    next(e);
  }
};

const deleteCompany = async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) {
      throw ApiError.BadRequest("Отсутствует id");
    }
    const result = await ordersService.deleteCompany(id);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getOrders,
  cancelOrder,
  createOrder,
  getCompanies,
  deleteCompany
};
