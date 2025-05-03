const orgService  = require('../services/orgService');

const getOrg = async (req, res, next) => {
try {
    const result = await orgService.getOrg();
    res.status(200).json(result);
} catch (e) {
    next(e);
}
}
module.exports = {
    getOrg
}