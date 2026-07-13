import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseV1Schema,
  AdminLoginRequestV1Schema,
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  AdminSystemStatusResponseV1Schema,
  BulkUpdateAdminBankMappingStatusRequestV1Schema,
  BulkUpdateAdminBankMappingStatusResponseV1Schema,
  ListAdminBankMappingsRequestV1Schema,
  UpdateAdminBankMappingRequestV1Schema,
  AuthLoginResponseV1Schema,
  AuthLogoutResponseV1Schema,
  CatalogBankListResponseV1Schema,
  HealthResponseV1Schema,
  CreatePracticeSessionRequestV1Schema,
  ListPracticeSessionsRequestV1Schema,
  PRACTICE_COMPLETED_COUNT_SEMANTICS_V1,
  PracticePayloadV1Schema,
  PracticeSessionPageV1Schema,
  SavePracticeDraftRequestV1Schema,
  PracticeSessionV1Schema,
  PracticeSubmitAnswerResponseV1Schema,
  SubmitPracticeAnswerRequestV1Schema,
  WrongQuestionDetailResponseV1Schema,
} from '../src/index.js';

const bankId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';
const wrongQuestionId = '40000000-0000-4000-8000-000000000001';

describe('v1 auth/catalog/error/health contracts', () => {
  it('parses auth responses with optional student ids and strict logout success', () => {
    expect(AuthLoginResponseV1Schema.parse({
      student: { loginName: 'alice', displayName: 'Alice' },
    })).toEqual({
      student: { loginName: 'alice', displayName: 'Alice' },
    });

    expect(AuthLoginResponseV1Schema.parse({
      student: { id: 'student-1', loginName: 'alice', displayName: 'Alice' },
    }).student.id).toBe('student-1');

    expect(AuthLogoutResponseV1Schema.parse({ success: true })).toEqual({ success: true });
    expect(() => AuthLogoutResponseV1Schema.parse({ success: false })).toThrow();
  });

  it('parses admin auth contracts with explicit roles and permissions', () => {
    expect(AdminLoginRequestV1Schema.parse({
      loginName: 'operator@example.com',
      password: 'secret',
    })).toEqual({
      loginName: 'operator@example.com',
      password: 'secret',
    });

    const response = AdminLoginResponseV1Schema.parse({
      admin: {
        id: 'admin-1',
        loginName: 'operator@example.com',
        displayName: 'Operator',
        roles: ['operator'],
        permissions: ['admin:self:read', 'bank_mapping:read', 'import_job:read'],
      },
      expiresAt: '2026-07-13T18:00:00.000Z',
    });

    expect(response.admin.roles).toEqual(['operator']);
    expect(AdminLogoutResponseV1Schema.parse({ success: true })).toEqual({ success: true });
    expect(() => AdminLoginRequestV1Schema.parse({ loginName: 'operator@example.com' })).toThrow();
  });

  it('parses admin bank mapping list and detail contracts', () => {
    const query = ListAdminBankMappingsRequestV1Schema.parse({
      status: 'active',
      visible: 'true',
      hasObjectiveQuestions: 'false',
      qGroup: '8',
      limit: '20',
      offset: '0',
    });
    expect(query).toMatchObject({
      status: 'active',
      visible: true,
      hasObjectiveQuestions: false,
      qGroup: 8,
      limit: 20,
      offset: 0,
    });

    const listItem = {
      bankId,
      rawName: 'Raw Bank',
      bankName: 'Admin Bank',
      subjectCategory: '信息技术',
      subjectName: 'C++',
      parentId: null,
      qGroup: 8,
      visible: true,
      status: 'active',
      difficulty: 'mixed',
      examPurpose: 'exam',
      questionTypes: ['single_choice'],
      audience: 'unknown',
      keywords: ['C++'],
      description: 'Admin-visible mapping.',
      notes: '',
      questionCount: 10,
      descendantQuestionCount: 12,
      objectiveQuestionCount: 9,
      version: 1,
      updatedAt: '2026-07-13T10:00:00.000Z',
      updatedBy: null,
    };

    expect(AdminBankMappingListResponseV1Schema.parse({
      bankMappings: [listItem],
      page: { limit: 20, offset: 0, hasMore: false },
    }).bankMappings[0]?.bankId).toBe(bankId);

    expect(AdminBankMappingDetailResponseV1Schema.parse({
      bankMapping: {
        ...listItem,
        parentName: null,
        questionTypeCounts: { single_choice: 9 },
        studentPreview: {
          visibleInStudentCatalog: true,
          reason: 'visible active bank with objective questions',
        },
      },
    }).bankMapping.questionTypeCounts).toEqual({ single_choice: 9 });

    expect(() => AdminBankMappingListResponseV1Schema.parse({
      bankMappings: [{ ...listItem, status: 'published' }],
      page: { limit: 20, offset: 0, hasMore: false },
    })).toThrow();
  });

  it('parses admin bank mapping write and bulk status contracts', () => {
    expect(UpdateAdminBankMappingRequestV1Schema.parse({
      expectedVersion: 3,
      changes: {
        bankName: 'C++ 程序设计题库',
        visible: true,
        status: 'active',
        keywords: ['C++', '机考'],
        notes: '',
      },
    })).toMatchObject({
      expectedVersion: 3,
      changes: { status: 'active', visible: true },
    });

    expect(() => UpdateAdminBankMappingRequestV1Schema.parse({
      expectedVersion: 3,
      changes: {},
    })).toThrow();

    expect(BulkUpdateAdminBankMappingStatusRequestV1Schema.parse({
      items: [{ bankId: bankId.toUpperCase(), expectedVersion: 1 }],
      changes: { visible: false, status: 'hidden' },
    }).items[0]?.bankId).toBe(bankId);

    expect(BulkUpdateAdminBankMappingStatusResponseV1Schema.parse({
      updated: [{ bankId, version: 2 }],
      failed: [{ bankId: '10000000-0000-4000-8000-000000000002', error: 'Bank mapping version conflict' }],
    }).updated[0]?.version).toBe(2);
  });

  it('parses admin system status contracts', () => {
    const status = AdminSystemStatusResponseV1Schema.parse({
      api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
      database: { ok: true, migrationCount: 5, currentMigration: '0005_admin_foundation.sql' },
      corpus: {
        classifications: 2941,
        questions: 89922,
        questionOptions: 154899,
        bankMappings: 2662,
        visibleBanks: 473,
      },
      imports: {
        tableExists: false,
        runningJobId: null,
        lastJob: null,
      },
      quality: {
        tableExists: false,
        openFlags: 0,
        blockingFlags: 0,
        excludedQuestions: 0,
      },
    });

    expect(status.database.currentMigration).toBe('0005_admin_foundation.sql');
    expect(() => AdminSystemStatusResponseV1Schema.parse({
      ...status,
      corpus: { ...status.corpus, questions: -1 },
    })).toThrow();
  });

  it('requires student catalog banks to be visible and counter-safe', () => {
    const response = CatalogBankListResponseV1Schema.parse({
      banks: [{
        bankId: 'english-basic',
        bankName: '考研英语基础题库',
        subjectCategory: '英语',
        subjectName: '考研英语',
        visible: true,
        status: 'published',
        keywords: ['英语', '阅读'],
        questionCount: 120,
        description: 'Phase 2 seed bank for English practice.',
      }],
    });

    expect(response.banks[0]?.bankId).toBe('english-basic');
    expect(() => CatalogBankListResponseV1Schema.parse({
      banks: [{ ...response.banks[0], visible: false }],
    })).toThrow('student catalog bank must be visible');
    expect(() => CatalogBankListResponseV1Schema.parse({
      banks: [{ ...response.banks[0], questionCount: -1 }],
    })).toThrow();
  });

  it('parses common error and health responses', () => {
    expect(ApiErrorResponseV1Schema.parse({ error: 'Unauthenticated' })).toEqual({ error: 'Unauthenticated' });
    expect(() => ApiErrorResponseV1Schema.parse({ error: '' })).toThrow();
    expect(HealthResponseV1Schema.parse({ ok: true, service: 'bkyexam-practice-api' })).toEqual({
      ok: true,
      service: 'bkyexam-practice-api',
    });
  });
});

describe('v1 practice contracts', () => {
  it('accepts a partial completed session and fixes completedCount semantics', () => {
    expect(PRACTICE_COMPLETED_COUNT_SEMANTICS_V1).toBe('answered_or_graded_questions');
    expect(PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 4,
      completedCount: 3,
      correctCount: 2,
      currentSort: 3,
      status: 'completed',
    })).toMatchObject({ questionCount: 4, completedCount: 3, status: 'completed' });
  });

  it('rejects impossible practice counters', () => {
    expect(() => PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 2,
      completedCount: 3,
      correctCount: 1,
      currentSort: 1,
      status: 'completed',
    })).toThrow('completedCount cannot exceed questionCount');

    expect(() => PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 3,
      completedCount: 2,
      correctCount: 3,
      currentSort: 1,
      status: 'active',
    })).toThrow('correctCount cannot exceed completedCount');
  });

  it('preserves a false draft answer in a practice payload', () => {
    const payload = PracticePayloadV1Schema.parse({
      session: {
        id: sessionId,
        bankId,
        mode: 'sequential',
        questionCount: 1,
        completedCount: 0,
        correctCount: 0,
        currentSort: 1,
        status: 'active',
      },
      questions: [{
        id: questionId,
        sort: 1,
        type: 'yes_no',
        content: 'false 是否是有效答案？',
        options: [],
        answered: false,
        draftAnswer: false,
        markedForReview: true,
      }],
    });

    expect(payload.questions[0]?.draftAnswer).toBe(false);
  });

  it('validates version-one create-session request boundaries', () => {
    expect(CreatePracticeSessionRequestV1Schema.parse({
      bankId,
      mode: 'random',
      limit: 70,
      questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
    })).toMatchObject({ bankId, limit: 70 });
    expect(CreatePracticeSessionRequestV1Schema.parse({
      bankId,
      questionTypes: ['future_custom_type'],
    }).questionTypes).toEqual(['future_custom_type']);
    expect(() => CreatePracticeSessionRequestV1Schema.parse({ bankId, limit: 201 })).toThrow();
    expect(() => SavePracticeDraftRequestV1Schema.parse({ answer: [''] })).toThrow();
  });

  it('keeps the legacy answer endpoint compatible with uppercase UUIDs', () => {
    const uppercaseQuestionId = questionId.toUpperCase();
    expect(SubmitPracticeAnswerRequestV1Schema.parse({
      questionId: uppercaseQuestionId,
      answer: ['option-a'],
    }).questionId).toBe(uppercaseQuestionId);

    expect(PracticeSubmitAnswerResponseV1Schema.parse({
      result: {
        questionId: uppercaseQuestionId,
        isCorrect: true,
        correctAnswer: ['option-a'],
        needsSelfReview: false,
      },
      session: {
        completedCount: 1,
        correctCount: 1,
        status: 'active',
      },
    }).result.questionId).toBe(uppercaseQuestionId);
  });

  it('validates active and completed session cards separately from full session results', () => {
    const active = PracticeSessionPageV1Schema.parse({
      sessions: [{
        id: sessionId,
        bankId,
        bankName: '数据库测试题库',
        origin: 'bank',
        mode: 'random',
        questionCount: 4,
        answeredCount: 2,
        correctCount: 0,
        reviewCount: 1,
        currentSort: 2,
        status: 'active',
        createdAt: '2026-07-11T08:00:00.000Z',
        updatedAt: '2026-07-11T08:02:00.000Z',
        completedAt: null,
      }],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    expect(active.sessions[0]?.answeredCount).toBe(2);
    expect(() => PracticeSessionPageV1Schema.parse({
      ...active,
      sessions: [{
        ...active.sessions[0],
        status: 'completed',
        completedAt: null,
      }],
    })).toThrow('completedAt is required for completed sessions');
  });

  it('coerces bounded session-list paging query values', () => {
    expect(ListPracticeSessionsRequestV1Schema.parse({
      status: 'completed',
      limit: '10',
      offset: '20',
    })).toEqual({ status: 'completed', limit: 10, offset: 20 });
    expect(() => ListPracticeSessionsRequestV1Schema.parse({
      status: 'active',
      limit: '51',
    })).toThrow();
  });
});

describe('v1 wrongbook contracts', () => {
  it('parses normalized correct answers and readable options', () => {
    const response = WrongQuestionDetailResponseV1Schema.parse({
      wrongQuestion: {
        id: wrongQuestionId,
        questionId,
        bankId,
        bankName: '数据库测试题库',
        subjectCategory: '信息技术',
        subjectName: 'PostgreSQL',
        questionType: 'multiple_choice',
        contentPreview: '哪些属于 ACID？',
        wrongCount: 1,
        lastAnswer: '["option-a"]',
        mastered: false,
        lastWrongAt: '2026-07-10T12:00:00.000Z',
        content: '以下哪些属于 ACID 属性？',
        options: [
          { id: 'option-a', sort: 1, content: '原子性' },
          { id: 'option-b', sort: 2, content: '一致性' },
        ],
        correctAnswer: ['option-a', 'option-b'],
        analysis: '原子性与一致性都属于 ACID。',
      },
    });

    expect(response.wrongQuestion.correctAnswer).toEqual(['option-a', 'option-b']);
  });
});
