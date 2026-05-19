import type { Logger } from "pino";

export interface AuditLoggers {
	app: Logger;
	error: Logger;
	adminAudit: Logger;
	userAudit: Logger;
	access: Logger;
}

// export interface AdminEventData {
//   event: string;
//   adminId: string;
//   adminEmail: string;
//   adminRole: string;
//   action: string;
//   auditType: 'ADMIN_ACTION';
//   timestamp: string;
//   targetUserId?: string;
//   targetUserEmail?: string;
//   changes?: any[];
//   justification?: string;
// }

export interface UserEventData {
	event: string;
	userId: string;
	userEmail: string;
	action: string;
	auditType: "USER_ACTION";
	timestamp: string;
	ip?: string;
	endpoint?: string;
	method?: string;
	statusCode?: number;
	duration?: string;
	[key: string]: any;
}

export interface AppLogData {
	level: string;
	message: string;
	timestamp: string;
	[key: string]: any;
}

// export interface ErrorLogData {
//   event?: string;
//   message: string;
//   error?: string;
//   stack?: string;
//   severity?: string;
//   [key: string]: any;
// }

export interface AccessLogData {
	method: string;
	path: string;
	status: number;
	duration: string;
	ip: string;
	userId: string;
	[key: string]: any;
}
