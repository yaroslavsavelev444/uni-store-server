const auditConfig = require("./audit-config");
const { NODE_ENV } = require("./env");

module.exports = auditConfig[NODE_ENV] || auditConfig.development;