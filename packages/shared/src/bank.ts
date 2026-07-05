import { z } from 'zod';

export const SubjectCategorySchema = z.enum(['社科', '信息技术', '英语', '其他']);
export type SubjectCategory = z.infer<typeof SubjectCategorySchema>;

export const BankStatusSchema = z.enum(['active', 'review', 'hidden', 'deprecated']);
export type BankStatus = z.infer<typeof BankStatusSchema>;

export const DifficultyLabelSchema = z.enum(['simple', 'medium', 'hard', 'mixed', 'unknown']);
export type DifficultyLabel = z.infer<typeof DifficultyLabelSchema>;
