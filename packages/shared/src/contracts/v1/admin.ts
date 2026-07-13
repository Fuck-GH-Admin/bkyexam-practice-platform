import { z } from 'zod';
import { CanonicalUuidV1Schema, CaseInsensitiveUuidV1Schema } from './common.js';

export const AdminRoleV1Schema = z.enum(['content_editor', 'operator', 'super_admin']);
export type AdminRoleV1 = z.infer<typeof AdminRoleV1Schema>;

export const AdminPermissionV1Schema = z.enum([
  'admin:self:read',
  'bank_mapping:read',
  'bank_mapping:write',
  'bank_mapping:publish',
  'question_review:read',
  'question_review:write',
  'import_job:read',
  'import_job:create',
  'system_status:read',
  'audit_log:read',
  'admin_user:manage',
]);
export type AdminPermissionV1 = z.infer<typeof AdminPermissionV1Schema>;

export const AdminUserV1Schema = z.object({
  id: z.string().min(1),
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(AdminRoleV1Schema),
  permissions: z.array(AdminPermissionV1Schema),
}).strict();
export type AdminUserV1 = z.infer<typeof AdminUserV1Schema>;

export const AdminLoginRequestV1Schema = z.object({
  loginName: z.string().min(1),
  password: z.string().min(1),
}).strict();
export type AdminLoginRequestV1 = z.infer<typeof AdminLoginRequestV1Schema>;

export const AdminLoginResponseV1Schema = z.object({
  admin: AdminUserV1Schema,
  expiresAt: z.string().datetime(),
}).strict();
export type AdminLoginResponseV1 = z.infer<typeof AdminLoginResponseV1Schema>;

export const AdminMeResponseV1Schema = AdminLoginResponseV1Schema;
export type AdminMeResponseV1 = z.infer<typeof AdminMeResponseV1Schema>;

export const AdminLogoutResponseV1Schema = z.object({
  success: z.literal(true),
}).strict();
export type AdminLogoutResponseV1 = z.infer<typeof AdminLogoutResponseV1Schema>;

export const AdminBankMappingStatusV1Schema = z.enum(['review', 'active', 'hidden', 'deprecated']);
export type AdminBankMappingStatusV1 = z.infer<typeof AdminBankMappingStatusV1Schema>;

const AdminQueryBooleanV1Schema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const ListAdminBankMappingsRequestV1Schema = z.object({
  status: AdminBankMappingStatusV1Schema.optional(),
  visible: AdminQueryBooleanV1Schema.optional(),
  subjectCategory: z.string().min(1).optional(),
  subjectName: z.string().min(1).optional(),
  keyword: z.string().min(1).optional(),
  qGroup: z.coerce.number().int().optional(),
  parentId: CaseInsensitiveUuidV1Schema.optional(),
  hasObjectiveQuestions: AdminQueryBooleanV1Schema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminBankMappingsRequestV1 = z.infer<typeof ListAdminBankMappingsRequestV1Schema>;

export const AdminBankMappingUpdatedByV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  displayName: z.string().min(1),
}).strict();
export type AdminBankMappingUpdatedByV1 = z.infer<typeof AdminBankMappingUpdatedByV1Schema>;

export const AdminBankMappingListItemV1Schema = z.object({
  bankId: CanonicalUuidV1Schema,
  rawName: z.string().min(1),
  bankName: z.string().min(1),
  subjectCategory: z.string().min(1),
  subjectName: z.string().min(1),
  parentId: CanonicalUuidV1Schema.nullable(),
  qGroup: z.number().int(),
  visible: z.boolean(),
  status: AdminBankMappingStatusV1Schema,
  difficulty: z.string().min(1),
  examPurpose: z.string().min(1),
  questionTypes: z.array(z.string()),
  audience: z.string().min(1),
  keywords: z.array(z.string()),
  description: z.string(),
  notes: z.string(),
  questionCount: z.number().int().nonnegative(),
  descendantQuestionCount: z.number().int().nonnegative(),
  objectiveQuestionCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  updatedBy: AdminBankMappingUpdatedByV1Schema.nullable(),
}).strict();
export type AdminBankMappingListItemV1 = z.infer<typeof AdminBankMappingListItemV1Schema>;

export const AdminBankMappingDetailV1Schema = AdminBankMappingListItemV1Schema.extend({
  parentName: z.string().min(1).nullable(),
  questionTypeCounts: z.object({}).catchall(z.number().int().nonnegative()),
  studentPreview: z.object({
    visibleInStudentCatalog: z.boolean(),
    reason: z.string().min(1),
  }).strict(),
}).strict();
export type AdminBankMappingDetailV1 = z.infer<typeof AdminBankMappingDetailV1Schema>;

export const AdminBankMappingListResponseV1Schema = z.object({
  bankMappings: z.array(AdminBankMappingListItemV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminBankMappingListResponseV1 = z.infer<typeof AdminBankMappingListResponseV1Schema>;

export const AdminBankMappingDetailResponseV1Schema = z.object({
  bankMapping: AdminBankMappingDetailV1Schema,
}).strict();
export type AdminBankMappingDetailResponseV1 = z.infer<typeof AdminBankMappingDetailResponseV1Schema>;

export const UpdateAdminBankMappingChangesV1Schema = z.object({
  bankName: z.string().min(1).optional(),
  subjectCategory: z.string().min(1).optional(),
  subjectName: z.string().min(1).optional(),
  visible: z.boolean().optional(),
  status: AdminBankMappingStatusV1Schema.optional(),
  difficulty: z.string().min(1).optional(),
  examPurpose: z.string().min(1).optional(),
  audience: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: 'At least one bank mapping change is required',
});
export type UpdateAdminBankMappingChangesV1 = z.infer<typeof UpdateAdminBankMappingChangesV1Schema>;

export const UpdateAdminBankMappingRequestV1Schema = z.object({
  expectedVersion: z.number().int().positive(),
  changes: UpdateAdminBankMappingChangesV1Schema,
}).strict();
export type UpdateAdminBankMappingRequestV1 = z.infer<typeof UpdateAdminBankMappingRequestV1Schema>;

export const BulkUpdateAdminBankMappingStatusItemV1Schema = z.object({
  bankId: CaseInsensitiveUuidV1Schema,
  expectedVersion: z.number().int().positive(),
}).strict();
export type BulkUpdateAdminBankMappingStatusItemV1 = z.infer<typeof BulkUpdateAdminBankMappingStatusItemV1Schema>;

export const BulkUpdateAdminBankMappingStatusChangesV1Schema = z.object({
  visible: z.boolean().optional(),
  status: AdminBankMappingStatusV1Schema.optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: 'At least one bank mapping status change is required',
});
export type BulkUpdateAdminBankMappingStatusChangesV1 = z.infer<
  typeof BulkUpdateAdminBankMappingStatusChangesV1Schema
>;

export const BulkUpdateAdminBankMappingStatusRequestV1Schema = z.object({
  items: z.array(BulkUpdateAdminBankMappingStatusItemV1Schema).min(1).max(100),
  changes: BulkUpdateAdminBankMappingStatusChangesV1Schema,
}).strict();
export type BulkUpdateAdminBankMappingStatusRequestV1 = z.infer<
  typeof BulkUpdateAdminBankMappingStatusRequestV1Schema
>;

export const BulkUpdateAdminBankMappingStatusResponseV1Schema = z.object({
  updated: z.array(z.object({
    bankId: CanonicalUuidV1Schema,
    version: z.number().int().positive(),
  }).strict()),
  failed: z.array(z.object({
    bankId: CanonicalUuidV1Schema,
    error: z.string().min(1),
  }).strict()),
}).strict();
export type BulkUpdateAdminBankMappingStatusResponseV1 = z.infer<
  typeof BulkUpdateAdminBankMappingStatusResponseV1Schema
>;

export const AdminSystemStatusResponseV1Schema = z.object({
  api: z.object({
    ok: z.literal(true),
    service: z.string().min(1),
    version: z.string().min(1),
  }).strict(),
  database: z.object({
    ok: z.boolean(),
    migrationCount: z.number().int().nonnegative(),
    currentMigration: z.string().min(1).nullable(),
  }).strict(),
  corpus: z.object({
    classifications: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
    questionOptions: z.number().int().nonnegative(),
    bankMappings: z.number().int().nonnegative(),
    visibleBanks: z.number().int().nonnegative(),
  }).strict(),
  imports: z.object({
    tableExists: z.boolean(),
    runningJobId: CanonicalUuidV1Schema.nullable(),
    lastJob: z.object({
      id: CanonicalUuidV1Schema,
      status: z.string().min(1),
      finishedAt: z.string().datetime().nullable(),
    }).strict().nullable(),
  }).strict(),
  quality: z.object({
    tableExists: z.boolean(),
    openFlags: z.number().int().nonnegative(),
    blockingFlags: z.number().int().nonnegative(),
    excludedQuestions: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type AdminSystemStatusResponseV1 = z.infer<typeof AdminSystemStatusResponseV1Schema>;

export const AdminImportJobKindV1Schema = z.enum(['full_corpus_import']);
export type AdminImportJobKindV1 = z.infer<typeof AdminImportJobKindV1Schema>;

export const AdminImportJobModeV1Schema = z.enum(['dry_run', 'import']);
export type AdminImportJobModeV1 = z.infer<typeof AdminImportJobModeV1Schema>;

export const AdminImportJobStatusV1Schema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type AdminImportJobStatusV1 = z.infer<typeof AdminImportJobStatusV1Schema>;

export const AdminImportJobOptionsV1Schema = z.object({
  batchSize: z.number().int().min(1).max(10_000).default(1_000),
  resetBeforeImport: z.boolean().default(false),
  generateMappings: z.boolean().default(true),
}).strict();
export type AdminImportJobOptionsV1 = z.infer<typeof AdminImportJobOptionsV1Schema>;

export const AdminImportJobProgressV1Schema = z.object({
  phase: z.string().min(1),
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict();
export type AdminImportJobProgressV1 = z.infer<typeof AdminImportJobProgressV1Schema>;

export const AdminImportJobSummaryV1Schema = z.object({
  classifications: z.number().int().nonnegative().optional(),
  questions: z.number().int().nonnegative().optional(),
  rawOptions: z.number().int().nonnegative().optional(),
  options: z.number().int().nonnegative().optional(),
  skippedOptions: z.number().int().nonnegative().optional(),
  bankMappings: z.number().int().nonnegative().optional(),
  questionTypes: z.object({}).catchall(z.number().int().nonnegative()).optional(),
}).strict();
export type AdminImportJobSummaryV1 = z.infer<typeof AdminImportJobSummaryV1Schema>;

export const AdminImportJobErrorSummaryV1Schema = z.array(z.object({
  message: z.string().min(1),
}).catchall(z.unknown()).strict());
export type AdminImportJobErrorSummaryV1 = z.infer<typeof AdminImportJobErrorSummaryV1Schema>;

export const AdminImportJobActorV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  displayName: z.string().min(1),
}).strict();
export type AdminImportJobActorV1 = z.infer<typeof AdminImportJobActorV1Schema>;

export const AdminImportJobV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  kind: AdminImportJobKindV1Schema,
  mode: AdminImportJobModeV1Schema,
  status: AdminImportJobStatusV1Schema,
  sourceDir: z.string().min(1),
  options: AdminImportJobOptionsV1Schema,
  progress: AdminImportJobProgressV1Schema,
  summary: AdminImportJobSummaryV1Schema,
  errorSummary: AdminImportJobErrorSummaryV1Schema,
  createdBy: AdminImportJobActorV1Schema.nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
}).strict();
export type AdminImportJobV1 = z.infer<typeof AdminImportJobV1Schema>;

export const ListAdminImportJobsRequestV1Schema = z.object({
  status: AdminImportJobStatusV1Schema.optional(),
  createdBy: CaseInsensitiveUuidV1Schema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminImportJobsRequestV1 = z.infer<typeof ListAdminImportJobsRequestV1Schema>;

export const CreateAdminImportJobRequestV1Schema = z.object({
  kind: AdminImportJobKindV1Schema,
  sourceDir: z.string().min(1),
  mode: AdminImportJobModeV1Schema,
  options: AdminImportJobOptionsV1Schema.default({
    batchSize: 1_000,
    resetBeforeImport: false,
    generateMappings: true,
  }),
}).strict();
export type CreateAdminImportJobRequestV1 = z.infer<typeof CreateAdminImportJobRequestV1Schema>;

export const AdminImportJobListResponseV1Schema = z.object({
  jobs: z.array(AdminImportJobV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminImportJobListResponseV1 = z.infer<typeof AdminImportJobListResponseV1Schema>;

export const AdminImportJobDetailResponseV1Schema = z.object({
  job: AdminImportJobV1Schema,
}).strict();
export type AdminImportJobDetailResponseV1 = z.infer<typeof AdminImportJobDetailResponseV1Schema>;

export const CreateAdminImportJobResponseV1Schema = z.object({
  job: AdminImportJobV1Schema,
}).strict();
export type CreateAdminImportJobResponseV1 = z.infer<typeof CreateAdminImportJobResponseV1Schema>;
