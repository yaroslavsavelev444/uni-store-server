const orgService  = require('../services/orgService');

const getOrg = async (req, res, next) => {
    try {
      const result = await orgService.getOrg(); // Один объект
      console.log(result);
      res.status(200).json({
        ...result,
        files: result.files || [],
      });
    } catch (e) {
      next(e);
    }
  };
module.exports = {
    getOrg
} 