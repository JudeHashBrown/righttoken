import { z } from "zod";

export const mailAssetReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    disposition: z.enum(["INLINE", "ATTACHMENT"]),
    sortOrder: z.number().int().min(0).max(99)
  })
  .strict();

const templateFields = z
  .object({
    name: z.string().trim().min(1).max(80),
    subject: z.string().trim().min(1).max(200),
    bodyText: z.string().trim().min(1).max(100_000),
    bodyHtml: z.string().trim().max(200_000).optional().default(""),
    assets: z
      .array(mailAssetReferenceSchema)
      .max(10)
      .optional()
      .default([]),
    locale: z.string().trim().min(2).max(20).default("zh-CN")
  })
  .strict();

function uniqueAssets<
  T extends { assets: Array<{ id: string; disposition: string }> }
>(schema: z.ZodType<T>) {
  return schema.refine(
    (value) =>
      new Set(
        value.assets.map(
          (asset) => `${asset.id}:${asset.disposition}`
        )
    ).size === value.assets.length,
    { message: "duplicate mail asset" }
  );
}

export const createMailTemplateSchema =
  uniqueAssets(templateFields);
export const publishMailTemplateVersionSchema =
  uniqueAssets(templateFields.omit({ locale: true }));

export const toggleMailTemplateSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict();
