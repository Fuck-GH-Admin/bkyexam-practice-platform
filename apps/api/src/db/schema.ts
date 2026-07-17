import { sql } from 'drizzle-orm';
import {
  boolean,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const classifications = pgTable(
  'classifications',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    qGroup: integer('q_group').notNull(),
    sort: integer('sort').notNull().default(0),
    isDeleted: boolean('is_deleted').notNull().default(false),
  },
  (table) => [
    index('classifications_parent_id_idx').on(table.parentId),
    index('classifications_q_group_idx').on(table.qGroup),
  ],
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey(),
    classificationId: uuid('classification_id')
      .notNull()
      .references(() => classifications.id),
    qType: integer('q_type').notNull(),
    normalizedType: text('normalized_type').notNull(),
    qGroup: integer('q_group').notNull(),
    content: text('content').notNull(),
    answerRaw: text('answer_raw').notNull().default(''),
    analyzeRaw: text('analyze_raw'),
    useCount: integer('use_count').notNull().default(0),
    difficulty: numeric('difficulty'),
    // Search will use a later PostgreSQL full-text/trigram migration, not a B-tree on raw text.
    searchableText: text('searchable_text').notNull().default(''),
  },
  (table) => [
    index('questions_classification_id_idx').on(table.classificationId),
    index('questions_normalized_type_idx').on(table.normalizedType),
  ],
);

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    sort: integer('sort').notNull(),
    content: text('content').notNull(),
  },
  (table) => [index('question_options_question_id_idx').on(table.questionId)],
);

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loginName: text('login_name').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    failedLoginWindowStartedAt: timestamp('failed_login_window_started_at', { withTimezone: true }),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [
    index('admin_users_locked_until_idx').on(table.lockedUntil)
      .where(sql`${table.lockedUntil} IS NOT NULL`),
    check('admin_users_status_check', sql`${table.status} IN ('active', 'disabled')`),
    check('admin_users_failed_login_count_check', sql`${table.failedLoginCount} >= 0`),
  ],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('admin_sessions_admin_user_id_idx').on(table.adminUserId),
    index('admin_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const adminUserRoles = pgTable(
  'admin_user_roles',
  {
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.adminUserId, table.role] }),
    index('admin_user_roles_role_idx').on(table.role),
    check('admin_user_roles_role_check', sql`${table.role} IN ('content_editor', 'operator', 'super_admin')`),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorAdminId: uuid('actor_admin_id').references(() => adminUsers.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    result: text('result').notNull().default('success'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_created_at_idx').on(table.actorAdminId, table.createdAt.desc()),
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId, table.createdAt.desc()),
    index('audit_logs_action_created_at_idx').on(table.action, table.createdAt.desc()),
    check('audit_logs_result_check', sql`${table.result} IN ('success', 'failure')`),
  ],
);

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    sourceDir: text('source_dir').notNull(),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    progress: jsonb('progress').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    errorSummary: jsonb('error_summary').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    workerId: text('worker_id'),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  },
  (table) => [
    index('import_jobs_status_created_at_idx').on(table.status, table.createdAt.desc()),
    index('import_jobs_created_by_idx').on(table.createdByAdminId, table.createdAt.desc()),
    index('import_jobs_worker_scan_idx').on(table.status, table.heartbeatAt, table.createdAt),
    uniqueIndex('import_jobs_one_running_kind_idx').on(table.kind).where(sql`${table.status} = 'running'`),
    uniqueIndex('import_jobs_one_active_kind_idx').on(table.kind)
      .where(sql`${table.status} IN ('queued', 'running')`),
    check('import_jobs_kind_check', sql`${table.kind} IN ('full_corpus_import')`),
    check('import_jobs_mode_check', sql`${table.mode} IN ('dry_run', 'import')`),
    check('import_jobs_status_check', sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`),
  ],
);

export const importJobEvents = pgTable(
  'import_job_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('import_job_events_job_stream_idx').on(table.jobId, table.id),
    check(
      'import_job_events_event_type_check',
      sql`${table.eventType} IN ('queued', 'running', 'progress', 'succeeded', 'failed', 'cancelled', 'recovered')`,
    ),
  ],
);

export const questionQualityFlags = pgTable(
  'question_quality_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    bankId: uuid('bank_id').references(() => classifications.id),
    flagType: text('flag_type').notNull(),
    severity: text('severity').notNull(),
    status: text('status').notNull().default('open'),
    note: text('note').notNull().default(''),
    excludedFromPractice: boolean('excluded_from_practice').notNull().default(false),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('question_quality_flags_question_id_idx').on(table.questionId),
    index('question_quality_flags_bank_status_idx').on(table.bankId, table.status),
    index('question_quality_flags_type_status_idx').on(table.flagType, table.status),
    index('question_quality_flags_excluded_open_idx').on(table.questionId)
      .where(sql`${table.excludedFromPractice} = true AND ${table.status} = 'open'`),
    check(
      'question_quality_flags_type_check',
      sql`${table.flagType} IN ('bad_answer', 'missing_option', 'bad_option', 'garbled_content', 'duplicate_question', 'wrong_type', 'needs_manual_review')`,
    ),
    check('question_quality_flags_severity_check', sql`${table.severity} IN ('low', 'medium', 'high', 'blocking')`),
    check('question_quality_flags_status_check', sql`${table.status} IN ('open', 'resolved', 'ignored')`),
  ],
);

export const questionOverrides = pgTable(
  'question_overrides',
  {
    questionId: uuid('question_id')
      .primaryKey()
      .references(() => questions.id, { onDelete: 'cascade' }),
    contentOverride: text('content_override'),
    answerRawOverride: text('answer_raw_override'),
    analyzeRawOverride: text('analyze_raw_override'),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(1),
    updatedByAdminId: uuid('updated_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('question_overrides_updated_by_admin_id_idx').on(table.updatedByAdminId),
    index('question_overrides_updated_at_idx').on(table.updatedAt.desc()),
    check('question_overrides_content_override_check', sql`${table.contentOverride} IS NULL OR length(${table.contentOverride}) > 0`),
    check('question_overrides_version_check', sql`${table.version} >= 1`),
  ],
);

export const questionOptionOverrides = pgTable(
  'question_option_overrides',
  {
    optionId: uuid('option_id')
      .primaryKey()
      .references(() => questionOptions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    contentOverride: text('content_override').notNull(),
    updatedByAdminId: uuid('updated_by_admin_id').references(() => adminUsers.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('question_option_overrides_question_id_idx').on(table.questionId),
    index('question_option_overrides_updated_by_admin_id_idx').on(table.updatedByAdminId),
    check('question_option_overrides_content_override_check', sql`length(${table.contentOverride}) > 0`),
  ],
);

export const questionOverrideRevisions = pgTable(
  'question_override_revisions',
  {
    id: uuid('id').primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    baseVersion: integer('base_version').notNull(),
    status: text('status').notNull(),
    contentOverride: text('content_override'),
    answerRawOverride: text('answer_raw_override'),
    analyzeRawOverride: text('analyze_raw_override'),
    optionContentOverrides: jsonb('option_content_overrides').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    diff: jsonb('diff').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    note: text('note').notNull().default(''),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(() => adminUsers.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note').notNull().default(''),
    appliedVersion: integer('applied_version'),
    rollbackFromRevisionId: uuid('rollback_from_revision_id')
      .references((): AnyPgColumn => questionOverrideRevisions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('question_override_revisions_one_active_idx').on(table.questionId)
      .where(sql`${table.status} IN ('draft', 'pending_review')`),
    index('question_override_revisions_question_history_idx').on(table.questionId, table.createdAt.desc(), table.id.desc()),
    index('question_override_revisions_pending_idx').on(table.status, table.submittedAt, table.createdAt)
      .where(sql`${table.status} = 'pending_review'`),
    index('question_override_revisions_created_by_idx').on(table.createdByAdminId),
    index('question_override_revisions_reviewed_by_idx').on(table.reviewedByAdminId),
    check('question_override_revisions_version_check', sql`${table.version} >= 1`),
    check('question_override_revisions_base_version_check', sql`${table.baseVersion} >= 0`),
    check(
      'question_override_revisions_status_check',
      sql`${table.status} IN ('draft', 'pending_review', 'approved', 'rejected')`,
    ),
  ],
);

export const bankMappings = pgTable(
  'bank_mappings',
  {
    bankId: uuid('bank_id')
      .primaryKey()
      .references(() => classifications.id),
    subjectCategory: text('subject_category').notNull(),
    subjectName: text('subject_name').notNull().default('未分类'),
    bankName: text('bank_name').notNull(),
    rawName: text('raw_name').notNull(),
    parentId: uuid('parent_id'),
    qGroup: integer('q_group').notNull(),
    visible: boolean('visible').notNull().default(false),
    status: text('status').notNull().default('review'),
    difficulty: text('difficulty').notNull().default('unknown'),
    examPurpose: text('exam_purpose').notNull().default('unknown'),
    questionTypes: jsonb('question_types').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    audience: text('audience').notNull().default('unknown'),
    keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    questionCount: integer('question_count').notNull().default(0),
    descendantQuestionCount: integer('descendant_question_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedByAdminId: uuid('updated_by_admin_id').references(() => adminUsers.id),
  },
  (table) => [
    index('bank_mappings_subject_category_idx').on(table.subjectCategory),
    index('bank_mappings_visible_idx').on(table.visible),
  ],
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey(),
    loginName: text('login_name').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    className: text('class_name'),
    groupName: text('group_name'),
    status: text('status').notNull().default('active'),
    passwordResetRequired: boolean('password_reset_required').notNull().default(false),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    failedLoginWindowStartedAt: timestamp('failed_login_window_started_at', { withTimezone: true }),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('students_status_idx').on(table.status),
    index('students_class_name_idx').on(table.className),
    index('students_group_name_idx').on(table.groupName),
    index('students_locked_until_idx').on(table.lockedUntil)
      .where(sql`${table.lockedUntil} IS NOT NULL`),
    check('students_status_check', sql`${table.status} IN ('active', 'disabled')`),
    check('students_failed_login_count_check', sql`${table.failedLoginCount} >= 0`),
  ],
);

export const studentLearningGoals = pgTable(
  'student_learning_goals',
  {
    studentId: uuid('student_id')
      .primaryKey()
      .references(() => students.id, { onDelete: 'cascade' }),
    dailyAttemptsTarget: integer('daily_attempts_target'),
    weeklyActiveDaysTarget: integer('weekly_active_days_target'),
    wrongQuestionsReviewTarget: integer('wrong_questions_review_target'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('student_learning_goals_updated_at_idx').on(table.updatedAt.desc()),
    check(
      'student_learning_goals_daily_attempts_target_check',
      sql`${table.dailyAttemptsTarget} IS NULL OR ${table.dailyAttemptsTarget} BETWEEN 1 AND 500`,
    ),
    check(
      'student_learning_goals_weekly_active_days_target_check',
      sql`${table.weeklyActiveDaysTarget} IS NULL OR ${table.weeklyActiveDaysTarget} BETWEEN 1 AND 7`,
    ),
    check(
      'student_learning_goals_wrong_questions_review_target_check',
      sql`${table.wrongQuestionsReviewTarget} IS NULL OR ${table.wrongQuestionsReviewTarget} BETWEEN 1 AND 100`,
    ),
  ],
);

export const studentSessions = pgTable(
  'student_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('student_sessions_student_id_idx').on(table.studentId),
    index('student_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const practiceAttempts = pgTable(
  'practice_attempts',
  {
    id: uuid('id').primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    bankId: uuid('bank_id')
      .notNull()
      .references(() => classifications.id),
    answer: text('answer').notNull().default(''),
    isCorrect: boolean('is_correct'),
    source: text('source').notNull().default('auto'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('practice_attempts_student_id_idx').on(table.studentId),
    index('practice_attempts_question_id_idx').on(table.questionId),
  ],
);

export const practiceSessions = pgTable(
  'practice_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    bankId: uuid('bank_id')
      .notNull()
      .references(() => classifications.id),
    mode: text('mode').notNull(),
    questionLimit: integer('question_limit').notNull().default(70),
    questionCount: integer('question_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    currentSort: integer('current_sort').notNull().default(1),
    status: text('status').notNull().default('active'),
    origin: text('origin').notNull().default('bank'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('practice_sessions_student_id_idx').on(table.studentId),
    index('practice_sessions_bank_id_idx').on(table.bankId),
    index('practice_sessions_status_idx').on(table.status),
    index('practice_sessions_student_status_updated_at_idx').on(
      table.studentId,
      table.status,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
    index('practice_sessions_student_completed_at_idx').on(
      table.studentId,
      table.completedAt.desc(),
      table.id.desc(),
    ).where(sql`${table.status} = 'completed'`),
    check('practice_sessions_current_sort_positive_check', sql`${table.currentSort} > 0`),
    check('practice_sessions_origin_check', sql`${table.origin} IN ('bank', 'wrongbook')`),
  ],
);

export const practiceSessionQuestions = pgTable(
  'practice_session_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    sort: integer('sort').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    isCorrect: boolean('is_correct'),
  },
  (table) => [
    index('practice_session_questions_session_id_idx').on(table.sessionId),
    index('practice_session_questions_question_id_idx').on(table.questionId),
    uniqueIndex('practice_session_questions_session_question_unique_idx').on(
      table.sessionId,
      table.questionId,
    ),
    uniqueIndex('practice_session_questions_session_sort_unique_idx').on(
      table.sessionId,
      table.sort,
    ),
  ],
);

export const practiceSessionDrafts = pgTable(
  'practice_session_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    draftAnswer: text('draft_answer').notNull().default(''),
    markedForReview: boolean('marked_for_review').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('practice_session_drafts_session_id_idx').on(table.sessionId),
    index('practice_session_drafts_student_id_idx').on(table.studentId),
    index('practice_session_drafts_question_id_idx').on(table.questionId),
    uniqueIndex('practice_session_drafts_session_question_unique_idx').on(
      table.sessionId,
      table.questionId,
    ),
  ],
);

export const wrongQuestions = pgTable(
  'wrong_questions',
  {
    id: uuid('id').primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    bankId: uuid('bank_id')
      .notNull()
      .references(() => classifications.id),
    wrongCount: integer('wrong_count').notNull().default(1),
    lastAnswer: text('last_answer').notNull().default(''),
    mastered: boolean('mastered').notNull().default(false),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    source: text('source').notNull().default('auto'),
    lastWrongAt: timestamp('last_wrong_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('wrong_questions_student_id_idx').on(table.studentId),
    index('wrong_questions_bank_id_idx').on(table.bankId),
    uniqueIndex('wrong_questions_student_question_bank_unique_idx').on(
      table.studentId,
      table.questionId,
      table.bankId,
    ),
  ],
);

export const questionBookmarks = pgTable(
  'question_bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    bankId: uuid('bank_id')
      .notNull()
      .references(() => classifications.id),
    favorite: boolean('favorite').notNull().default(false),
    longTermReview: boolean('long_term_review').notNull().default(false),
    note: text('note').notNull().default(''),
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('question_bookmarks_student_updated_at_idx').on(
      table.studentId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
    index('question_bookmarks_student_bank_idx').on(
      table.studentId,
      table.bankId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
    index('question_bookmarks_question_id_idx').on(table.questionId),
    uniqueIndex('question_bookmarks_student_question_bank_unique_idx').on(
      table.studentId,
      table.questionId,
      table.bankId,
    ),
    check('question_bookmarks_flag_check', sql`${table.favorite} = true OR ${table.longTermReview} = true`),
    check('question_bookmarks_source_check', sql`${table.source} IN ('manual', 'practice_review', 'wrongbook')`),
  ],
);
