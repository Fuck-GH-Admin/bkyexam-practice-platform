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
  'student_account:read',
  'student_account:write',
  'student_account:reset_password',
  'student_account:revoke_session',
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

export const AdminManagedUserStatusV1Schema = z.enum(['active', 'disabled']);
export type AdminManagedUserStatusV1 = z.infer<typeof AdminManagedUserStatusV1Schema>;

const AdminManagedUserRolesV1Schema = z.array(AdminRoleV1Schema).min(1).max(3).superRefine((roles, context) => {
  if (new Set(roles).size !== roles.length) {
    context.addIssue({
      code: 'custom',
      message: 'Duplicate admin roles are not allowed',
    });
  }
});

export const AdminManagedUserV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  status: AdminManagedUserStatusV1Schema,
  roles: AdminManagedUserRolesV1Schema,
  permissions: z.array(AdminPermissionV1Schema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
}).strict();
export type AdminManagedUserV1 = z.infer<typeof AdminManagedUserV1Schema>;

export const ListAdminUsersRequestV1Schema = z.object({
  status: AdminManagedUserStatusV1Schema.optional(),
  role: AdminRoleV1Schema.optional(),
  keyword: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminUsersRequestV1 = z.infer<typeof ListAdminUsersRequestV1Schema>;

export const CreateAdminUserRequestV1Schema = z.object({
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  password: z.string().min(8),
  roles: AdminManagedUserRolesV1Schema,
}).strict();
export type CreateAdminUserRequestV1 = z.infer<typeof CreateAdminUserRequestV1Schema>;

export const UpdateAdminUserRequestV1Schema = z.object({
  displayName: z.string().min(1).optional(),
  status: AdminManagedUserStatusV1Schema.optional(),
  roles: AdminManagedUserRolesV1Schema.optional(),
  password: z.string().min(8).optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: 'At least one admin user change is required',
});
export type UpdateAdminUserRequestV1 = z.infer<typeof UpdateAdminUserRequestV1Schema>;

export const AdminUserListResponseV1Schema = z.object({
  adminUsers: z.array(AdminManagedUserV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminUserListResponseV1 = z.infer<typeof AdminUserListResponseV1Schema>;

export const AdminUserDetailResponseV1Schema = z.object({
  adminUser: AdminManagedUserV1Schema,
}).strict();
export type AdminUserDetailResponseV1 = z.infer<typeof AdminUserDetailResponseV1Schema>;

const AdminQueryBooleanV1Schema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const AdminStudentStatusV1Schema = z.enum(['active', 'disabled']);
export type AdminStudentStatusV1 = z.infer<typeof AdminStudentStatusV1Schema>;

export const AdminStudentCreatedByV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  displayName: z.string().min(1),
}).strict();
export type AdminStudentCreatedByV1 = z.infer<typeof AdminStudentCreatedByV1Schema>;

export const AdminStudentV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  className: z.string().min(1).nullable(),
  groupName: z.string().min(1).nullable(),
  status: AdminStudentStatusV1Schema,
  passwordResetRequired: z.boolean(),
  passwordChangedAt: z.string().datetime().nullable(),
  failedLoginCount: z.number().int().nonnegative(),
  lockedUntil: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdBy: AdminStudentCreatedByV1Schema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type AdminStudentV1 = z.infer<typeof AdminStudentV1Schema>;

export const ListAdminStudentsRequestV1Schema = z.object({
  status: AdminStudentStatusV1Schema.optional(),
  className: z.string().min(1).optional(),
  groupName: z.string().min(1).optional(),
  passwordResetRequired: AdminQueryBooleanV1Schema.optional(),
  lockedOnly: AdminQueryBooleanV1Schema.optional(),
  keyword: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminStudentsRequestV1 = z.infer<typeof ListAdminStudentsRequestV1Schema>;

export const CreateAdminStudentRequestV1Schema = z.object({
  loginName: z.string().min(1),
  displayName: z.string().min(1).optional(),
  initialPassword: z.string().min(8),
  className: z.string().min(1).nullable().optional(),
  groupName: z.string().min(1).nullable().optional(),
  passwordResetRequired: z.boolean().default(true),
}).strict();
export type CreateAdminStudentRequestV1 = z.infer<typeof CreateAdminStudentRequestV1Schema>;

export const BulkCreateAdminStudentItemV1Schema = z.object({
  loginName: z.string().min(1),
  displayName: z.string().min(1).optional(),
  initialPassword: z.string().min(8).optional(),
  className: z.string().min(1).nullable().optional(),
  groupName: z.string().min(1).nullable().optional(),
}).strict();
export type BulkCreateAdminStudentItemV1 = z.infer<typeof BulkCreateAdminStudentItemV1Schema>;

export const BulkCreateAdminStudentsOptionsV1Schema = z.object({
  defaultInitialPassword: z.string().min(8).optional(),
  passwordResetRequired: z.boolean().default(true),
  revokeExistingSessions: z.boolean().default(true),
  skipExisting: z.boolean().default(true),
}).strict().default({
  passwordResetRequired: true,
  revokeExistingSessions: true,
  skipExisting: true,
});
export type BulkCreateAdminStudentsOptionsV1 = z.infer<typeof BulkCreateAdminStudentsOptionsV1Schema>;

export const BulkCreateAdminStudentsRequestV1Schema = z.object({
  students: z.array(BulkCreateAdminStudentItemV1Schema).min(1).max(200),
  options: BulkCreateAdminStudentsOptionsV1Schema,
}).strict().superRefine((request, context) => {
  request.students.forEach((student, index) => {
    if (!student.initialPassword && !request.options.defaultInitialPassword) {
      context.addIssue({
        code: 'custom',
        message: 'initialPassword or options.defaultInitialPassword is required',
        path: ['students', index, 'initialPassword'],
      });
    }
  });
});
export type BulkCreateAdminStudentsRequestV1 = z.infer<typeof BulkCreateAdminStudentsRequestV1Schema>;

export const UpdateAdminStudentRequestV1Schema = z.object({
  displayName: z.string().min(1).optional(),
  status: AdminStudentStatusV1Schema.optional(),
  className: z.string().min(1).nullable().optional(),
  groupName: z.string().min(1).nullable().optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: 'At least one student account change is required',
});
export type UpdateAdminStudentRequestV1 = z.infer<typeof UpdateAdminStudentRequestV1Schema>;

export const ResetAdminStudentPasswordRequestV1Schema = z.object({
  newPassword: z.string().min(8),
  revokeExistingSessions: z.boolean().default(true),
}).strict();
export type ResetAdminStudentPasswordRequestV1 = z.infer<typeof ResetAdminStudentPasswordRequestV1Schema>;

export const AdminStudentListResponseV1Schema = z.object({
  students: z.array(AdminStudentV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminStudentListResponseV1 = z.infer<typeof AdminStudentListResponseV1Schema>;

export const AdminStudentDetailResponseV1Schema = z.object({
  student: AdminStudentV1Schema,
}).strict();
export type AdminStudentDetailResponseV1 = z.infer<typeof AdminStudentDetailResponseV1Schema>;

export const BulkCreateAdminStudentsResponseV1Schema = z.object({
  created: z.array(AdminStudentV1Schema),
  skipped: z.array(z.object({
    loginName: z.string().min(1),
    reason: z.string().min(1),
  }).strict()),
  failed: z.array(z.object({
    loginName: z.string().min(1),
    error: z.string().min(1),
  }).strict()),
}).strict();
export type BulkCreateAdminStudentsResponseV1 = z.infer<typeof BulkCreateAdminStudentsResponseV1Schema>;

export const ResetAdminStudentPasswordResponseV1Schema = z.object({
  student: AdminStudentV1Schema,
  revokedSessions: z.number().int().nonnegative(),
}).strict();
export type ResetAdminStudentPasswordResponseV1 = z.infer<typeof ResetAdminStudentPasswordResponseV1Schema>;

export const RevokeAdminStudentSessionsResponseV1Schema = z.object({
  studentId: CanonicalUuidV1Schema,
  revokedSessions: z.number().int().nonnegative(),
}).strict();
export type RevokeAdminStudentSessionsResponseV1 = z.infer<typeof RevokeAdminStudentSessionsResponseV1Schema>;

export const AdminAuditLogResultV1Schema = z.enum(['success', 'failure']);
export type AdminAuditLogResultV1 = z.infer<typeof AdminAuditLogResultV1Schema>;

export const AdminAuditLogActorV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  loginName: z.string().min(1),
  displayName: z.string().min(1),
}).strict();
export type AdminAuditLogActorV1 = z.infer<typeof AdminAuditLogActorV1Schema>;

export const AdminAuditLogEntryV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  actor: AdminAuditLogActorV1Schema.nullable(),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  metadata: z.object({}).catchall(z.unknown()),
  result: AdminAuditLogResultV1Schema,
  createdAt: z.string().datetime(),
}).strict();
export type AdminAuditLogEntryV1 = z.infer<typeof AdminAuditLogEntryV1Schema>;

export const ListAdminAuditLogsRequestV1Schema = z.object({
  actorAdminId: CaseInsensitiveUuidV1Schema.optional(),
  action: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  result: AdminAuditLogResultV1Schema.optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminAuditLogsRequestV1 = z.infer<typeof ListAdminAuditLogsRequestV1Schema>;

export const AdminAuditLogListResponseV1Schema = z.object({
  auditLogs: z.array(AdminAuditLogEntryV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminAuditLogListResponseV1 = z.infer<typeof AdminAuditLogListResponseV1Schema>;

export const AdminBankMappingStatusV1Schema = z.enum(['review', 'active', 'hidden', 'deprecated']);
export type AdminBankMappingStatusV1 = z.infer<typeof AdminBankMappingStatusV1Schema>;

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
}).catchall(z.unknown()));
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

export const AdminImportJobErrorReportResponseV1Schema = z.object({
  jobId: CanonicalUuidV1Schema,
  status: AdminImportJobStatusV1Schema,
  errorSummary: AdminImportJobErrorSummaryV1Schema,
}).strict();
export type AdminImportJobErrorReportResponseV1 = z.infer<
  typeof AdminImportJobErrorReportResponseV1Schema
>;

export const AdminQuestionFlagTypeV1Schema = z.enum([
  'bad_answer',
  'missing_option',
  'bad_option',
  'garbled_content',
  'duplicate_question',
  'wrong_type',
  'needs_manual_review',
]);
export type AdminQuestionFlagTypeV1 = z.infer<typeof AdminQuestionFlagTypeV1Schema>;

export const AdminQuestionFlagSeverityV1Schema = z.enum(['low', 'medium', 'high', 'blocking']);
export type AdminQuestionFlagSeverityV1 = z.infer<typeof AdminQuestionFlagSeverityV1Schema>;

export const AdminQuestionFlagStatusV1Schema = z.enum(['open', 'resolved', 'ignored']);
export type AdminQuestionFlagStatusV1 = z.infer<typeof AdminQuestionFlagStatusV1Schema>;

export const AdminQuestionReviewActorV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  displayName: z.string().min(1),
}).strict();
export type AdminQuestionReviewActorV1 = z.infer<typeof AdminQuestionReviewActorV1Schema>;

export const AdminQuestionReviewFlagV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  type: AdminQuestionFlagTypeV1Schema,
  severity: AdminQuestionFlagSeverityV1Schema,
  status: AdminQuestionFlagStatusV1Schema,
  note: z.string(),
  createdAt: z.string().datetime(),
  createdBy: AdminQuestionReviewActorV1Schema.nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: AdminQuestionReviewActorV1Schema.nullable(),
}).strict();
export type AdminQuestionReviewFlagV1 = z.infer<typeof AdminQuestionReviewFlagV1Schema>;

export const AdminQuestionReviewItemV1Schema = z.object({
  questionId: CanonicalUuidV1Schema,
  bankId: CanonicalUuidV1Schema,
  bankName: z.string().min(1),
  questionType: z.string().min(1),
  contentPreview: z.string(),
  optionCount: z.number().int().nonnegative(),
  answerPreview: z.string(),
  flags: z.array(AdminQuestionReviewFlagV1Schema),
  excludedFromPractice: z.boolean(),
}).strict();
export type AdminQuestionReviewItemV1 = z.infer<typeof AdminQuestionReviewItemV1Schema>;

export const AdminQuestionReviewOptionV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  sort: z.number().int(),
  content: z.string(),
  overrideContent: z.string().nullable(),
  effectiveContent: z.string(),
}).strict();
export type AdminQuestionReviewOptionV1 = z.infer<typeof AdminQuestionReviewOptionV1Schema>;

export const AdminQuestionReviewOverrideV1Schema = z.object({
  version: z.number().int().positive(),
  contentOverride: z.string().nullable(),
  answerRawOverride: z.string().nullable(),
  analyzeRawOverride: z.string().nullable(),
  note: z.string(),
  updatedBy: AdminQuestionReviewActorV1Schema.nullable(),
  updatedAt: z.string().datetime(),
}).strict();
export type AdminQuestionReviewOverrideV1 = z.infer<typeof AdminQuestionReviewOverrideV1Schema>;

export const AdminQuestionReviewDetailV1Schema = AdminQuestionReviewItemV1Schema.extend({
  content: z.string(),
  answerRaw: z.string(),
  analyzeRaw: z.string().nullable(),
  options: z.array(AdminQuestionReviewOptionV1Schema),
  override: AdminQuestionReviewOverrideV1Schema.nullable(),
  overrideVersion: z.number().int().nonnegative(),
}).strict();
export type AdminQuestionReviewDetailV1 = z.infer<typeof AdminQuestionReviewDetailV1Schema>;

export const ListAdminQuestionReviewsRequestV1Schema = z.object({
  bankId: CaseInsensitiveUuidV1Schema.optional(),
  questionType: z.string().min(1).optional(),
  flagType: AdminQuestionFlagTypeV1Schema.optional(),
  status: AdminQuestionFlagStatusV1Schema.default('open'),
  severity: AdminQuestionFlagSeverityV1Schema.optional(),
  keyword: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAdminQuestionReviewsRequestV1 = z.infer<
  typeof ListAdminQuestionReviewsRequestV1Schema
>;

export const AddAdminQuestionReviewFlagV1Schema = z.object({
  type: AdminQuestionFlagTypeV1Schema,
  severity: AdminQuestionFlagSeverityV1Schema,
  note: z.string().default(''),
}).strict();
export type AddAdminQuestionReviewFlagV1 = z.infer<typeof AddAdminQuestionReviewFlagV1Schema>;

export const UpdateAdminQuestionReviewRequestV1Schema = z.object({
  addFlags: z.array(AddAdminQuestionReviewFlagV1Schema).max(20).default([]),
  resolveFlagIds: z.array(CaseInsensitiveUuidV1Schema).max(100).default([]),
  ignoredFlagIds: z.array(CaseInsensitiveUuidV1Schema).max(100).default([]),
  excludedFromPractice: z.boolean().optional(),
}).strict().superRefine((request, context) => {
  const actionCount = request.addFlags.length
    + request.resolveFlagIds.length
    + request.ignoredFlagIds.length
    + (request.excludedFromPractice === undefined ? 0 : 1);

  if (actionCount === 0) {
    context.addIssue({
      code: 'custom',
      message: 'At least one question review change is required',
    });
  }

  const ignored = new Set(request.ignoredFlagIds);
  for (const flagId of request.resolveFlagIds) {
    if (ignored.has(flagId)) {
      context.addIssue({
        code: 'custom',
        message: 'A flag cannot be both resolved and ignored',
        path: ['resolveFlagIds'],
      });
      break;
    }
  }
});
export type UpdateAdminQuestionReviewRequestV1 = z.infer<
  typeof UpdateAdminQuestionReviewRequestV1Schema
>;

export const UpdateAdminQuestionOverrideOptionV1Schema = z.object({
  optionId: CaseInsensitiveUuidV1Schema,
  content: z.string().min(1),
}).strict();
export type UpdateAdminQuestionOverrideOptionV1 = z.infer<
  typeof UpdateAdminQuestionOverrideOptionV1Schema
>;

export const UpdateAdminQuestionOverrideRequestV1Schema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  content: z.string().min(1).optional(),
  answerRaw: z.string().optional(),
  analyzeRaw: z.string().nullable().optional(),
  optionContentOverrides: z.array(UpdateAdminQuestionOverrideOptionV1Schema).max(100).default([]),
  note: z.string().default(''),
}).strict().superRefine((request, context) => {
  const hasQuestionFieldChange = request.content !== undefined
    || request.answerRaw !== undefined
    || request.analyzeRaw !== undefined;
  const hasOptionChange = request.optionContentOverrides.length > 0;
  const hasNoteChange = request.note.trim().length > 0;

  if (!hasQuestionFieldChange && !hasOptionChange && !hasNoteChange) {
    context.addIssue({
      code: 'custom',
      message: 'At least one question override change is required',
    });
  }

  const optionIds = new Set<string>();
  for (const [index, option] of request.optionContentOverrides.entries()) {
    if (optionIds.has(option.optionId)) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate option override ids are not allowed',
        path: ['optionContentOverrides', index, 'optionId'],
      });
      break;
    }
    optionIds.add(option.optionId);
  }
});
export type UpdateAdminQuestionOverrideRequestV1 = z.infer<
  typeof UpdateAdminQuestionOverrideRequestV1Schema
>;

export const AdminQuestionReviewListResponseV1Schema = z.object({
  questions: z.array(AdminQuestionReviewItemV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type AdminQuestionReviewListResponseV1 = z.infer<
  typeof AdminQuestionReviewListResponseV1Schema
>;

export const AdminQuestionReviewDetailResponseV1Schema = z.object({
  question: AdminQuestionReviewDetailV1Schema,
}).strict();
export type AdminQuestionReviewDetailResponseV1 = z.infer<
  typeof AdminQuestionReviewDetailResponseV1Schema
>;

export const AdminQuestionOverrideResponseV1Schema = z.object({
  question: AdminQuestionReviewDetailV1Schema,
}).strict();
export type AdminQuestionOverrideResponseV1 = z.infer<
  typeof AdminQuestionOverrideResponseV1Schema
>;
