import { z } from 'zod';

export const CatalogBankV1Schema = z.object({
  bankId: z.string().min(1),
  bankName: z.string().min(1),
  subjectCategory: z.string(),
  subjectName: z.string(),
  visible: z.boolean(),
  status: z.string().min(1),
  keywords: z.array(z.string()),
  questionCount: z.number().int().nonnegative(),
  description: z.string(),
}).strict().superRefine((bank, context) => {
  if (!bank.visible) {
    context.addIssue({
      code: 'custom',
      path: ['visible'],
      message: 'student catalog bank must be visible',
    });
  }
});
export type CatalogBankV1 = z.infer<typeof CatalogBankV1Schema>;

export const CatalogBankListResponseV1Schema = z.object({
  banks: z.array(CatalogBankV1Schema),
}).strict();
export type CatalogBankListResponseV1 = z.infer<typeof CatalogBankListResponseV1Schema>;

export const ListCatalogBanksRequestV1Schema = z.object({
  category: z.string().min(1).optional(),
  keyword: z.string().min(1).optional(),
}).strict();
export type ListCatalogBanksRequestV1 = z.infer<typeof ListCatalogBanksRequestV1Schema>;
