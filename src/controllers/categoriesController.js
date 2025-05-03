const categoryService = require('../services/categoryService');

const getCategories = async (req, res, next) => {
    try {
        const categories = await categoryService.getCategories();
        res.status(200).json(categories);
    } catch (e) {
        next(e);
    }
};

module.exports = {
    getCategories,
};