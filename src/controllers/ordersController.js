const ordersService = require("../services/ordersService");
const getOrders = async (req, res, next) => {
    try {
        const result = await ordersService.getOrders(req.user);
        res.status(200).json(result);
    } catch (e) {
        next(e);
    }
};

module.exports = {
    getOrders,
};