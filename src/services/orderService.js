const ApiError = require("../exceptions/api-error");
const { OrderModel } = require("../models/indexModels");

const getOrders = async () => {
    try {
        const orders = await OrderModel.find().populate("products.product").populate("user").populate("companyData.company");
        console.log(orders);
        return orders;
    } catch (error) {
        throw ApiError.InternalServerError(error.message || "Произошла ошибка");
    }
};
const changeStatusOrder = async (status, orderId, text) => {
    try {
        const order = await OrderModel.findById(orderId);
        order.status = status;
        if(text && status === 'rejected') {
            order.cancelData.cancelReason = text;
            order.cancelData.cancelDate = new Date();
            //TODO отправить уведомление
        }

        await order.save();
        return order;
    } catch (error) {
        throw ApiError.InternalServerError(error.message || "Произошла ошибка");
    }
};

const uploadOrderFile = async (file) => {
    try {
      
    } catch (e) {
        throw ApiError.InternalServerError(e.message || "Ошибка загрузки продукта");
    }
};

const deleteUploadedFile = async (fileId) => {
    try {
      
    } catch (e) {
        throw ApiError.InternalServerError(e.message || "Ошибка загрузки продукта");
    }
};

module.exports = {
    changeStatusOrder,
    uploadOrderFile,
    deleteUploadedFile,
    getOrders
};