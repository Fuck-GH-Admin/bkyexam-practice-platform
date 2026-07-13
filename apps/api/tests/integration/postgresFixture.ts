import type { QueryClient } from '../../src/db/client.js';

export const fixtureIds = {
  bank: '10000000-0000-4000-8000-000000000001',
  childClassification: '10000000-0000-4000-8000-000000000002',
  hiddenBank: '10000000-0000-4000-8000-000000000009',
  questions: {
    singleCorrect: '20000000-0000-4000-8000-000000000001',
    multipleWrong: '20000000-0000-4000-8000-000000000002',
    falseCorrect: '20000000-0000-4000-8000-000000000003',
    unanswered: '20000000-0000-4000-8000-000000000004',
    hidden: '20000000-0000-4000-8000-000000000009',
  },
  options: {
    singleCorrect: '30000000-0000-4000-8000-000000000001',
    singleWrong: '30000000-0000-4000-8000-000000000002',
    multipleFirst: '30000000-0000-4000-8000-000000000003',
    multipleSecond: '30000000-0000-4000-8000-000000000004',
    multipleWrong: '30000000-0000-4000-8000-000000000005',
    unansweredCorrect: '30000000-0000-4000-8000-000000000006',
    unansweredWrong: '30000000-0000-4000-8000-000000000007',
    hiddenCorrect: '30000000-0000-4000-8000-000000000009',
  },
} as const;

const falseAnswerId = '22222222-2222-2222-2222-222222222222';

export async function resetAndSeedPostgresFixture(client: QueryClient) {
  await client.query(`
    TRUNCATE TABLE
      question_quality_flags,
      import_jobs,
      audit_logs,
      admin_sessions,
      admin_user_roles,
      practice_session_drafts,
      practice_session_questions,
      practice_sessions,
      student_sessions,
      wrong_questions,
      practice_attempts,
      question_options,
      questions,
      bank_mappings,
      admin_users,
      students,
      classifications
    RESTART IDENTITY CASCADE;

    INSERT INTO classifications (id, name, parent_id, q_group, sort, is_deleted)
    VALUES
      ('${fixtureIds.bank}', '数据库集成测试题库', NULL, 100, 1, false),
      ('${fixtureIds.childClassification}', '子分类', '${fixtureIds.bank}', 100, 2, false),
      ('${fixtureIds.hiddenBank}', '隐藏测试题库', NULL, 101, 1, false);

    INSERT INTO bank_mappings (
      bank_id,
      subject_category,
      subject_name,
      bank_name,
      raw_name,
      parent_id,
      q_group,
      visible,
      status,
      difficulty,
      exam_purpose,
      question_types,
      audience,
      keywords,
      description,
      notes,
      question_count,
      descendant_question_count
    )
    VALUES
      (
        '${fixtureIds.bank}',
        '质量保障',
        'PostgreSQL',
        '数据库集成测试题库',
        '数据库集成测试题库',
        NULL,
        100,
        true,
        'active',
        'mixed',
        'integration',
        '["single_choice","multiple_choice","yes_no"]'::jsonb,
        'developers',
        '["integration","postgres"]'::jsonb,
        '用于真实 PostgreSQL integration profile 的最小题库。',
        '',
        4,
        4
      ),
      (
        '${fixtureIds.hiddenBank}',
        '质量保障',
        'PostgreSQL',
        '隐藏测试题库',
        '隐藏测试题库',
        NULL,
        101,
        false,
        'active',
        'mixed',
        'integration',
        '["single_choice"]'::jsonb,
        'developers',
        '["hidden"]'::jsonb,
        '不应出现在学生题库目录。',
        '',
        1,
        1
      );

    INSERT INTO questions (
      id,
      classification_id,
      q_type,
      normalized_type,
      q_group,
      content,
      answer_raw,
      analyze_raw,
      use_count,
      difficulty,
      searchable_text
    )
    VALUES
      (
        '${fixtureIds.questions.singleCorrect}',
        '${fixtureIds.bank}',
        1,
        'single_choice',
        100,
        'PostgreSQL 中哪个命令用于提交当前事务？',
        '${fixtureIds.options.singleCorrect}',
        'COMMIT 提交当前事务。',
        0,
        1,
        'postgresql commit transaction'
      ),
      (
        '${fixtureIds.questions.multipleWrong}',
        '${fixtureIds.childClassification}',
        2,
        'multiple_choice',
        100,
        '以下哪些属于 ACID 属性？',
        '${fixtureIds.options.multipleFirst},${fixtureIds.options.multipleSecond}',
        '原子性与一致性都属于 ACID。',
        0,
        2,
        'acid atomicity consistency'
      ),
      (
        '${fixtureIds.questions.falseCorrect}',
        '${fixtureIds.childClassification}',
        3,
        'yes_no',
        100,
        '判断：false 不是一个有效的已作答布尔值。',
        '${falseAnswerId}',
        'false 是有效布尔答案。',
        0,
        1,
        'boolean false answer'
      ),
      (
        '${fixtureIds.questions.unanswered}',
        '${fixtureIds.bank}',
        1,
        'single_choice',
        100,
        '哪一个是 PostgreSQL 的默认端口？',
        '${fixtureIds.options.unansweredCorrect}',
        '默认端口是 5432。',
        0,
        1,
        'postgresql default port 5432'
      ),
      (
        '${fixtureIds.questions.hidden}',
        '${fixtureIds.hiddenBank}',
        1,
        'single_choice',
        101,
        '隐藏题库中的题目',
        '${fixtureIds.options.hiddenCorrect}',
        '',
        0,
        1,
        'hidden bank question'
      );

    INSERT INTO question_options (id, question_id, sort, content)
    VALUES
      ('${fixtureIds.options.singleCorrect}', '${fixtureIds.questions.singleCorrect}', 1, 'COMMIT'),
      ('${fixtureIds.options.singleWrong}', '${fixtureIds.questions.singleCorrect}', 2, 'ROLLBACK'),
      ('${fixtureIds.options.multipleFirst}', '${fixtureIds.questions.multipleWrong}', 1, '原子性'),
      ('${fixtureIds.options.multipleSecond}', '${fixtureIds.questions.multipleWrong}', 2, '一致性'),
      ('${fixtureIds.options.multipleWrong}', '${fixtureIds.questions.multipleWrong}', 3, '随机性'),
      ('${fixtureIds.options.unansweredCorrect}', '${fixtureIds.questions.unanswered}', 1, '5432'),
      ('${fixtureIds.options.unansweredWrong}', '${fixtureIds.questions.unanswered}', 2, '3306'),
      ('${fixtureIds.options.hiddenCorrect}', '${fixtureIds.questions.hidden}', 1, '隐藏答案');
  `);
}
