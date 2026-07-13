import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseV1Schema,
  AdminLoginRequestV1Schema,
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminImportJobDetailResponseV1Schema,
  AdminImportJobErrorReportResponseV1Schema,
  AdminImportJobListResponseV1Schema,
  AdminAuditLogListResponseV1Schema,
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  AdminUserDetailResponseV1Schema,
  AdminUserListResponseV1Schema,
  AdminQuestionReviewDetailResponseV1Schema,
  AdminQuestionReviewListResponseV1Schema,
  AdminSystemStatusResponseV1Schema,
  BulkUpdateAdminBankMappingStatusRequestV1Schema,
  BulkUpdateAdminBankMappingStatusResponseV1Schema,
  CreateAdminImportJobRequestV1Schema,
  CreateAdminImportJobResponseV1Schema,
  CreateAdminUserRequestV1Schema,
  ListAdminAuditLogsRequestV1Schema,
  ListAdminUsersRequestV1Schema,
  ListAdminQuestionReviewsRequestV1Schema,
  ListAdminBankMappingsRequestV1Schema,
  ListAdminImportJobsRequestV1Schema,
  UpdateAdminQuestionReviewRequestV1Schema,
  UpdateAdminBankMappingRequestV1Schema,
  UpdateAdminUserRequestV1Schema,
  AuthLoginResponseV1Schema,
  AuthLogoutResponseV1Schema,
  CatalogBankListResponseV1Schema,
  HealthResponseV1Schema,
  GetLearningDashboardRequestV1Schema,
  LearningDashboardResponseV1Schema,
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
        permissions: ['admin:self:read', 'bank_mapping:read', 'import_job:read', 'audit_log:read'],
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
        database: { ok: true, migrationCount: 7, currentMigration: '0007_question_quality_flags.sql' },
      corpus: {
        classifications: 2941,
        questions: 89922,
        questionOptions: 154899,
        bankMappings: 2662,
        visibleBanks: 473,
      },
      imports: {
        tableExists: true,
        runningJobId: null,
        lastJob: {
          id: '60000000-0000-4000-8000-000000000001',
          status: 'succeeded',
          finishedAt: '2026-07-13T10:00:01.000Z',
        },
      },
      quality: {
        tableExists: false,
        openFlags: 0,
        blockingFlags: 0,
        excludedQuestions: 0,
      },
    });

    expect(status.database.currentMigration).toBe('0007_question_quality_flags.sql');
    expect(() => AdminSystemStatusResponseV1Schema.parse({
      ...status,
      corpus: { ...status.corpus, questions: -1 },
    })).toThrow();
  });

  it('parses admin import job contracts with defaults and summary boundaries', () => {
    const jobId = '60000000-0000-4000-8000-000000000001';
    const createdBy = '50000000-0000-4000-8000-000000000001';
    const request = CreateAdminImportJobRequestV1Schema.parse({
      kind: 'full_corpus_import',
      mode: 'dry_run',
      sourceDir: 'C:\\questionbank',
    });
    expect(request.options).toEqual({
      batchSize: 1000,
      resetBeforeImport: false,
      generateMappings: true,
    });
    expect(ListAdminImportJobsRequestV1Schema.parse({
      status: 'succeeded',
      createdBy: createdBy.toUpperCase(),
      limit: '10',
      offset: '5',
    })).toEqual({
      status: 'succeeded',
      createdBy,
      limit: 10,
      offset: 5,
    });

    const job = {
      id: jobId,
      kind: 'full_corpus_import',
      mode: 'dry_run',
      status: 'succeeded',
      sourceDir: 'C:\\questionbank',
      options: request.options,
      progress: { phase: 'done', current: 2, total: 2 },
      summary: {
        classifications: 1,
        questions: 2,
        rawOptions: 3,
        options: 2,
        skippedOptions: 1,
        bankMappings: 1,
        questionTypes: { single_choice: 2 },
      },
      errorSummary: [],
      createdBy: { id: createdBy, displayName: 'Operator' },
      createdAt: '2026-07-13T10:00:00.000Z',
      startedAt: '2026-07-13T10:00:00.000Z',
      finishedAt: '2026-07-13T10:00:01.000Z',
    };

    expect(CreateAdminImportJobResponseV1Schema.parse({ job }).job.summary.questions).toBe(2);
    expect(AdminImportJobListResponseV1Schema.parse({
      jobs: [job],
      page: { limit: 20, offset: 0, hasMore: false },
    }).jobs[0]?.id).toBe(jobId);
    expect(AdminImportJobDetailResponseV1Schema.parse({ job }).job.createdBy?.id).toBe(createdBy);
    expect(AdminImportJobErrorReportResponseV1Schema.parse({
      jobId,
      status: 'failed',
      errorSummary: [{ message: 'source file malformed', path: 'q.txt' }],
    }).errorSummary[0]?.message).toBe('source file malformed');
    expect(() => CreateAdminImportJobRequestV1Schema.parse({
      ...request,
      options: { ...request.options, batchSize: 0 },
    })).toThrow();
  });

  it('parses admin user management contracts and protects role boundaries', () => {
    const adminId = '50000000-0000-4000-8000-000000000001';

    expect(ListAdminUsersRequestV1Schema.parse({
      status: 'active',
      role: 'operator',
      keyword: 'operator',
      limit: '10',
      offset: '5',
    })).toEqual({
      status: 'active',
      role: 'operator',
      keyword: 'operator',
      limit: 10,
      offset: 5,
    });

    expect(CreateAdminUserRequestV1Schema.parse({
      loginName: 'operator@example.com',
      displayName: 'Operator',
      password: 'secret123',
      roles: ['operator'],
    }).roles).toEqual(['operator']);
    expect(() => CreateAdminUserRequestV1Schema.parse({
      loginName: 'operator@example.com',
      displayName: 'Operator',
      password: 'short',
      roles: ['operator'],
    })).toThrow();
    expect(() => UpdateAdminUserRequestV1Schema.parse({})).toThrow();
    expect(() => UpdateAdminUserRequestV1Schema.parse({
      roles: ['operator', 'operator'],
    })).toThrow();

    const adminUser = {
      id: adminId,
      loginName: 'operator@example.com',
      displayName: 'Operator',
      status: 'active',
      roles: ['operator'],
      permissions: ['admin:self:read', 'bank_mapping:read', 'import_job:read', 'import_job:create', 'system_status:read'],
      createdAt: '2026-07-14T10:00:00.000Z',
      updatedAt: '2026-07-14T10:00:00.000Z',
      lastLoginAt: null,
    };

    expect(AdminUserListResponseV1Schema.parse({
      adminUsers: [adminUser],
      page: { limit: 20, offset: 0, hasMore: false },
    }).adminUsers[0]?.loginName).toBe('operator@example.com');
    expect(AdminUserDetailResponseV1Schema.parse({ adminUser }).adminUser.status).toBe('active');
  });

  it('parses admin audit log list contracts and filters', () => {
    const adminId = '50000000-0000-4000-8000-000000000001';
    const auditLogId = '90000000-0000-4000-8000-000000000001';

    expect(ListAdminAuditLogsRequestV1Schema.parse({
      actorAdminId: adminId.toUpperCase(),
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      result: 'success',
      createdFrom: '2026-07-13T00:00:00.000Z',
      createdTo: '2026-07-14T00:00:00.000Z',
      limit: '10',
      offset: '5',
    })).toEqual({
      actorAdminId: adminId,
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      result: 'success',
      createdFrom: '2026-07-13T00:00:00.000Z',
      createdTo: '2026-07-14T00:00:00.000Z',
      limit: 10,
      offset: 5,
    });

    expect(AdminAuditLogListResponseV1Schema.parse({
      auditLogs: [{
        id: auditLogId,
        actor: { id: adminId, loginName: 'operator@example.com', displayName: 'Operator' },
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: bankId,
        before: { visible: false },
        after: { visible: true },
        metadata: { ip: '127.0.0.1' },
        result: 'success',
        createdAt: '2026-07-13T10:00:00.000Z',
      }],
      page: { limit: 10, offset: 5, hasMore: false },
    }).auditLogs[0]?.action).toBe('bank_mapping.update');

    expect(() => AdminAuditLogListResponseV1Schema.parse({
      auditLogs: [{
        id: auditLogId,
        actor: null,
        action: '',
        resourceType: 'system',
        resourceId: 'bootstrap',
        before: null,
        after: null,
        metadata: {},
        result: 'success',
        createdAt: '2026-07-13T10:00:00.000Z',
      }],
      page: { limit: 10, offset: 5, hasMore: false },
    })).toThrow();
  });

  it('parses admin question review contracts and update actions', () => {
    const flagId = '70000000-0000-4000-8000-000000000001';
    expect(ListAdminQuestionReviewsRequestV1Schema.parse({
      bankId: bankId.toUpperCase(),
      flagType: 'bad_answer',
      severity: 'blocking',
      limit: '10',
      offset: '5',
    })).toMatchObject({
      bankId,
      flagType: 'bad_answer',
      status: 'open',
      severity: 'blocking',
      limit: 10,
      offset: 5,
    });

    expect(UpdateAdminQuestionReviewRequestV1Schema.parse({
      addFlags: [{ type: 'bad_answer', severity: 'high', note: '答案与解析不一致' }],
      resolveFlagIds: [flagId.toUpperCase()],
      excludedFromPractice: true,
    })).toMatchObject({
      addFlags: [{ type: 'bad_answer', severity: 'high', note: '答案与解析不一致' }],
      resolveFlagIds: [flagId],
      ignoredFlagIds: [],
      excludedFromPractice: true,
    });
    expect(() => UpdateAdminQuestionReviewRequestV1Schema.parse({})).toThrow();
    expect(() => UpdateAdminQuestionReviewRequestV1Schema.parse({
      resolveFlagIds: [flagId],
      ignoredFlagIds: [flagId],
    })).toThrow();

    const question = {
      questionId,
      bankId,
      bankName: '数据库集成测试题库',
      questionType: 'single_choice',
      contentPreview: 'PostgreSQL 中哪个命令用于提交当前事务？',
      optionCount: 2,
      answerPreview: 'COMMIT',
      flags: [{
        id: flagId,
        type: 'bad_answer',
        severity: 'high',
        status: 'open',
        note: '答案与解析不一致',
        createdAt: '2026-07-13T10:00:00.000Z',
        createdBy: { id: '50000000-0000-4000-8000-000000000001', displayName: 'Operator' },
        resolvedAt: null,
        resolvedBy: null,
      }],
      excludedFromPractice: true,
    };

    expect(AdminQuestionReviewListResponseV1Schema.parse({
      questions: [question],
      page: { limit: 20, offset: 0, hasMore: false },
    }).questions[0]?.excludedFromPractice).toBe(true);
    expect(AdminQuestionReviewDetailResponseV1Schema.parse({ question }).question.flags[0]?.type).toBe('bad_answer');
    expect(() => AdminQuestionReviewDetailResponseV1Schema.parse({
      question: { ...question, flags: [{ ...question.flags[0], severity: 'fatal' }] },
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

  it('parses learning dashboard contracts and counter boundaries', () => {
    expect(GetLearningDashboardRequestV1Schema.parse({ recentLimit: '3' })).toEqual({ recentLimit: 3 });
    expect(GetLearningDashboardRequestV1Schema.parse({})).toEqual({ recentLimit: 5 });

    const dashboard = LearningDashboardResponseV1Schema.parse({
      generatedAt: '2026-07-14T10:00:00.000Z',
      summary: {
        activeSessions: 2,
        completedSessions: 1,
        reviewSessions: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestions: 1,
        masteredWrongQuestions: 1,
        pendingWrongQuestions: 0,
        lastPracticedAt: '2026-07-14T09:00:00.000Z',
      },
      recentBanks: [{
        bankId,
        bankName: '数据库测试题库',
        subjectCategory: '质量保障',
        subjectName: 'PostgreSQL',
        lastPracticedAt: '2026-07-14T09:00:00.000Z',
        sessions: 3,
        completedSessions: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestions: 1,
      }],
      questionTypes: [{
        questionType: 'single_choice',
        attempts: 1,
        gradedAttempts: 1,
        correctAttempts: 1,
        accuracy: 1,
        wrongQuestions: 0,
      }],
      wrongbook: {
        total: 1,
        mastered: 1,
        pending: 0,
        lastWrongAt: '2026-07-14T08:30:00.000Z',
      },
    });

    expect(dashboard.summary.accuracy).toBe(0.6667);
    expect(() => LearningDashboardResponseV1Schema.parse({
      ...dashboard,
      summary: { ...dashboard.summary, correctAttempts: 4 },
    })).toThrow('correctAttempts cannot exceed gradedAttempts');
    expect(() => GetLearningDashboardRequestV1Schema.parse({ recentLimit: '11' })).toThrow();
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
