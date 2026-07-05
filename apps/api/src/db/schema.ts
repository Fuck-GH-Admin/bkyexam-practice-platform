import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
  },
  (table) => [
    index('bank_mappings_subject_category_idx').on(table.subjectCategory),
    index('bank_mappings_visible_idx').on(table.visible),
  ],
);

export const students = pgTable('students', {
  id: uuid('id').primaryKey(),
  loginName: text('login_name').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('practice_sessions_student_id_idx').on(table.studentId),
    index('practice_sessions_bank_id_idx').on(table.bankId),
    index('practice_sessions_status_idx').on(table.status),
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
