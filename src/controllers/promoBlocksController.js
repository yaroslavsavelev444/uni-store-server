import ApiError from "../exceptions/api-error";
import {
  getMainMaterials as _getMainMaterials,
  getPromoBlock,
} from "../services/promoBlockService";

const getPromoBlocks = async (req, res, next) => {
  const { page } = req.query;
  console.log(page);

  if (!page) {
    return ApiError.BadRequest("Отсутствует page");
  }
  try {
    const result = await getPromoBlock({ page });
    console.log("resultgetPromoBlocks", result);
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
};
const getMainMaterials = async (req, res, next) => {
  try {
    const materials = await _getMainMaterials();
    console.log("materials", materials);
    res.status(200).json(materials);
  } catch (err) {
    next(err);
  }
};

export default {
  getPromoBlocks,
  getMainMaterials,
};
