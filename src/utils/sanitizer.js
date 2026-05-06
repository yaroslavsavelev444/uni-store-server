import xss from "xss";

const sanitizeHtml = (value) => {
	if (typeof value !== "string") return value;

	return xss(value, {
		whiteList: {},
		stripIgnoreTag: true,
		stripIgnoreTagBody: ["script", "style"],
	});
};

export default { sanitizeHtml };
