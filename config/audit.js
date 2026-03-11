import auditConfig, { development } from "./audit-config";
import { NODE_ENV } from "./env";

export default auditConfig[NODE_ENV] || development;
