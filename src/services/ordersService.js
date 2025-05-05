const ApiError = require("../exceptions/api-error");
const { OrderModel } = require("../models/indexModels");

const getOrders = async (userData) => {
    try {
        const orders = await OrderModel.find({ user: userData.id }).populate("products.product");
        return orders;
    } catch (error) {
        throw ApiError.InternalServerError(error.message || "Произошла ошибка");
    }
};

module.exports = {
    getOrders,
};