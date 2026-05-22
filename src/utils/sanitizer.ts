import xss from "xss";

export const sanitizeHtml = (value: any) => {
  if (typeof value !== "string") return value;

  return xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "style"],
  });
};
