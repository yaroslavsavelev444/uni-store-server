import auditConfig, { development } from "./audit-config.js";
import { NODE_ENV } from "./env.js";

export default auditConfig[NODE_ENV] || development;
