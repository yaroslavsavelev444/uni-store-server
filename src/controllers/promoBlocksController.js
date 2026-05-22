const ApiError = require("../exceptions/api-error");
const promoBlockService = require("../services/promoBlockService");

const getPromoBlocks = async (req, res, next) => {
    const {page} = req.query
    console.log(page);
    
    if(!page) {
        return ApiError.BadRequest("Отсутствует page");
    }
    try {
        const result = await promoBlockService.getPromoBlock({ page });
        console.log('resultgetPromoBlocks', result);
        res.status(200).json(result);
    } catch (e) {
        next(e);
    }
};
const getMainMaterials = async (req, res, next) => {
  try {
    const materials = await promoBlockService.getMainMaterials();
    console.log('materials', materials);
    res.status(200).json(materials);
  } catch (err) {
    next(err);
  }
};

module.exports = {
    getPromoBlocks,
    getMainMaterials
}