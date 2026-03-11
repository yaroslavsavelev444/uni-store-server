import { boolean, object, string } from "joi";

const schema = object({
  name: string().optional(),
  ios: object({
    url: string()
      .uri({ scheme: [/https?/] })
      .allow("")
      .optional(),
    meta: object().optional(),
  }).optional(),
  android: object({
    url: string()
      .uri({ scheme: [/https?/] })
      .allow("")
      .optional(),
    meta: object().optional(),
  }).optional(),
  note: string().allow("").optional(),
  active: boolean().optional(),
});

export default (payload) => schema.validate(payload, { abortEarly: false });
